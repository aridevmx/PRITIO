import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Check, Plus, UserPlus } from "lucide-react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type {
  CreateTaskInput,
  Quadrant as QuadrantKey,
  Space,
  Task,
} from "@/types";
import type { UpdateTaskInput } from "@/types";
import { useTasks } from "@/features/tasks/useTasks";
import { useProjects } from "@/features/projects/useProjects";
import { useAssignees } from "@/features/assignees/useAssignees";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import {
  isApproverRole,
  useMyWorkspaceRole,
} from "@/features/workspaces/useMyWorkspaceRole";
import {
  QUADRANTS,
  QUADRANT_ORDER,
} from "@/features/tasks/quadrants";
import { QuadrantColumn } from "@/features/tasks/components/QuadrantColumn";
import { TaskFormDialog } from "@/features/tasks/components/TaskFormDialog";
import { ApprovalsBanner } from "@/features/tasks/components/ApprovalsBanner";
import { CompletedTasksSection } from "@/features/tasks/components/CompletedTasksSection";
import {
  SpaceToolbar,
  type ProjectFilter,
} from "@/features/tasks/components/SpaceToolbar";
import { MonthCalendar } from "@/features/calendar/MonthCalendar";
import { MobileWeekCalendar } from "@/features/calendar/MobileWeekCalendar";
// Lazy: KpisView solo se monta cuando el user cambia a "kpis" via
// ViewModeToggle. Es la 2da view mas pesada (charts + agregaciones).
const KpisView = lazy(() =>
  import("@/features/tasks/KpisView").then((m) => ({ default: m.KpisView })),
);
import { useWorkspaceMembers } from "@/features/workspaces/useWorkspaceMembers";
import { useAuth } from "@/features/auth/AuthProvider";
import { roleLabel } from "@/features/workspaces/roleHierarchy";
import {
  taskBelongsToMeFilter,
  taskHasAssignee,
  taskIsUnassigned,
  taskMatchesAssigneeFilter,
} from "@/features/tasks/taskFilters";
// Lazy: paneles modales (Projects, Assignees, Members, WorkspaceSettings)
// solo se montan cuando el user los abre desde la toolbar/sidebar.
const ProjectsPanel = lazy(() =>
  import("@/features/projects/ProjectsPanel").then((m) => ({
    default: m.ProjectsPanel,
  })),
);
import { useTaskNavigation } from "@/features/tasks/TaskNavigationProvider";
const AssigneesPanel = lazy(() =>
  import("@/features/assignees/AssigneesPanel").then((m) => ({
    default: m.AssigneesPanel,
  })),
);
const MembersPanel = lazy(() =>
  import("@/features/invitations/MembersPanel").then((m) => ({
    default: m.MembersPanel,
  })),
);
import { useSeatSummary } from "@/features/invitations/useSeatSummary";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ErrorState,
  LoadingState,
  friendlyError,
} from "@/components/State";
import { cn } from "@/lib/utils";
import {
  ViewModeToggle,
  type ViewMode,
} from "@/features/tasks/components/ViewModeToggle";
import { AgendaScopeSelector } from "@/features/tasks/components/AgendaScopeSelector";
import {
  FamilyOnboardingBanner,
  TeamOnboardingBanner,
} from "@/features/tasks/components/OnboardingBanners";
import { useTaskPermissions } from "@/features/tasks/useTaskPermissions";
import { useSubordinatesScope } from "@/features/tasks/useSubordinatesScope";
import { QuadrantsMiniNavigator } from "@/features/tasks/components/QuadrantsMiniNavigator";
import { useGrace } from "@/features/tasks/GraceProvider";

const FOCUSED_QUADRANT_KEY = "prio.focusedQuadrant";

interface QuadrantsViewProps {
  space: Space;
  title?: string;
  /** Capabilities — what features apply to this space */
  capabilities: {
    projects: boolean;
    responsibles: boolean;
    approvals: boolean;
    /** Members management (invitations panel). Only true for team workspaces. */
    members: boolean;
  };
  /** Label for the people management button (Equipo, Familia) */
  peopleLabel?: string;
  /** Empty state copy */
  emptyText?: string;
}

export function QuadrantsView({
  space,
  title,
  capabilities,
  peopleLabel,
  emptyText,
}: QuadrantsViewProps) {
  const tasksApi = useTasks({ space, completed: false });
  const { projects } = useProjects();
  const { assignees } = useAssignees();
  const { activeWorkspace } = useWorkspace();
  const { role } = useMyWorkspaceRole();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  // Para aprobaciones (incluye leader, alineado con migracion 0019)
  const canApprove = isApproverRole(role);
  // Indicadores: visible para TODOS los miembros del workspace. La
  // vista filtra el alcance segun rol (owner/leader = global,
  // admin/member = solo lo suyo) — pero el boton siempre se muestra.

  const showAnyToolbar =
    capabilities.projects || capabilities.responsibles;

  // Filters
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  // Dialogs
  const [formState, setFormState] = useState<{
    open: boolean;
    task: Task | null;
    initialQuadrant: QuadrantKey;
  }>({ open: false, task: null, initialQuadrant: "do" });
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [showAssigneesPanel, setShowAssigneesPanel] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);

  // Seat summary: usado para mostrar "Familia completa" en lugar
  // del boton Invitar cuando el plan esta lleno. El hook hace su
  // propia query — costo bajo y se debouncea con Realtime.
  const { summary: seatSummary } = useSeatSummary();
  const isFamilyFull = seatSummary?.isFull ?? false;

  // Cuadrante en foco para la vista mobile (cuando solo se renderiza
  // uno en full-width). En desktop se ignora — siempre se ven los 4.
  // Persiste en localStorage asi al volver a la app el usuario
  // recupera el ultimo que usaba.
  const [focusedQuadrant, setFocusedQuadrant] = useState<QuadrantKey>(() => {
    const stored = localStorage.getItem(
      FOCUSED_QUADRANT_KEY,
    ) as QuadrantKey | null;
    return stored && QUADRANT_ORDER.includes(stored) ? stored : "do";
  });
  function handleFocusQuadrant(key: QuadrantKey) {
    setFocusedQuadrant(key);
    try {
      localStorage.setItem(FOCUSED_QUADRANT_KEY, key);
    } catch {
      // Safari incognito puede bloquear localStorage. Ignoramos: el
      // foco vive solo en memoria hasta refrescar.
    }
  }

  // Si el provider señaliza pendiente abrir el panel de Miembros
  // (notificacion de cambio de rol), lo abrimos y consumimos el flag.
  const taskNav = useTaskNavigation();
  useEffect(() => {
    if (taskNav.pendingMembersPanelOpen) {
      setShowMembersPanel(true);
      taskNav.consumePendingMembersPanelOpen();
    }
  }, [taskNav]);

  // Sincronizar el filtro estatico de proyecto con el deep-link:
  // cuando navegamos a un proyecto via notificacion, el chip de ese
  // proyecto en la toolbar se selecciona automaticamente. Asi el
  // user ve la tarea filtrada y no tiene que tocar nada.
  useEffect(() => {
    if (taskNav.highlightedProjectId) {
      setProjectFilter(taskNav.highlightedProjectId);
    }
  }, [taskNav.highlightedProjectId]);

  // Dual sensors: MouseSensor para desktop (drag inicia al mover 6px),
  // TouchSensor para mobile (long-press 200ms inicia drag; bajo
  // tolerancia 5px asi el scroll del cuadrante no se confunde con
  // intento de arrastrar). Patron recomendado por dnd-kit para
  // soporte simultaneo touch + mouse sin conflictos.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  // View mode: cuadrantes (default), calendario o indicadores
  const [viewMode, setViewMode] = useState<ViewMode>("quadrants");

  // Fase 3: en la vista de calendario el manager puede elegir ver la
  // agenda de uno de sus subordinados. null = "Yo" (default). Solo
  // aplica a viewMode === "calendar". Se resetea al cambiar de vista
  // para que el filtrado no afecte cuadrantes/KPIs.
  const [agendaSubordinateId, setAgendaSubordinateId] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (viewMode !== "calendar") {
      setAgendaSubordinateId(null);
    }
  }, [viewMode]);

  // Si el usuario clica una notificacion de tarea estando en
  // viewMode != "quadrants" (KPIs o Calendar), forzamos el cambio a
  // cuadrantes para que la TaskCard este visible y reciba el highlight.
  // En mobile ademas ponemos en foco el cuadrante de esa tarea, sino
  // el user veria un cuadrante distinto al de la tarea destacada.
  useEffect(() => {
    if (!taskNav.highlightedTaskId) return;
    setViewMode("quadrants");
    const task = tasksApi.tasks.find(
      (t) => t.id === taskNav.highlightedTaskId,
    );
    if (task) {
      setFocusedQuadrant(task.quadrant);
      try {
        localStorage.setItem(FOCUSED_QUADRANT_KEY, task.quadrant);
      } catch {
        // ignore (Safari incognito)
      }
    }
    // tasksApi.tasks intencionalmente fuera de deps: el efecto solo
    // dispara con la notificacion nueva. Si las tareas aun no cargaron
    // el find falla y el foco se queda donde estaba, lo cual es OK.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskNav.highlightedTaskId]);

  // Perfiles del workspace para mostrar quién creó cada tarea
  const { members } = useWorkspaceMembers();
  const profilesById = useMemo(() => {
    const map = new Map<string, import("@/types").Profile>();
    for (const { profile } of members) {
      map.set(profile.id, profile);
    }
    return map;
  }, [members]);

  // Mapa user_id → rol. Lo usa el ApprovalsBanner para resolver el
  // aprobador asignado a cada tarea pendiente (mig 0039).
  const rolesByUserId = useMemo(() => {
    const map = new Map<string, import("@/types").WorkspaceRole>();
    for (const { member } of members) {
      map.set(member.userId, member.role);
    }
    return map;
  }, [members]);

  // Permisos por tarea (edit/delete) — extraido a useTaskPermissions.
  const { canEditTask, canDeleteTask } = useTaskPermissions();

  // Mig 0076: el provider del "undo send" recibe la tarea recien
  // creada cuando entro a grace y maneja el toast con countdown.
  const grace = useGrace();

  // Mig 0078: el grace period es preferencia personal del miembro.
  // Buscamos la fila del current user en `members` (ya cargada para
  // mostrar quien creo cada tarea) y leemos SU approvalGraceSeconds.
  // Si no se encuentra (caso degenerado), trata como 0 = apagado.
  const myApprovalGraceSeconds = useMemo(() => {
    if (!currentUserId) return 0;
    const me = members.find((m) => m.member.userId === currentUserId);
    return me?.member.approvalGraceSeconds ?? 0;
  }, [members, currentUserId]);

  // Subordinados/superiores visibles + resolver de assignee ids —
  // useSubordinatesScope. sharedSuperiors lista managers que activaron
  // agenda_shared (mig 0044), visibles para members.
  const { subordinates, sharedSuperiors, resolveUserAssigneeIds } =
    useSubordinatesScope();
  const subordinateAssigneeIds = useMemo(
    () => resolveUserAssigneeIds(agendaSubordinateId),
    [resolveUserAssigneeIds, agendaSubordinateId],
  );

  const filteredTasks = useMemo(() => {
    let list = tasksApi.tasks;

    if (capabilities.projects) {
      if (projectFilter === "none") {
        list = list.filter((t) => !t.projectId);
      } else if (projectFilter !== "all") {
        list = list.filter((t) => t.projectId === projectFilter);
      }
    }

    if (capabilities.responsibles) {
      if (responsibleFilter === "__unassigned__") {
        list = list.filter(taskIsUnassigned);
      } else if (responsibleFilter === "__me__") {
        // Chip "Yo": resuelve a TODOS los assignees donde el user
        // esta vinculado (multi-area, mig 0034). Asi un user en
        // varias etiquetas ve las tareas de todas, mas las juntas
        // como participante.
        const myAssigneeIds = new Set(
          currentUserId
            ? assignees
                .filter(
                  (a) =>
                    (a.linkedUserIds &&
                      a.linkedUserIds.includes(currentUserId)) ||
                    a.linkedUserId === currentUserId,
                )
                .map((a) => a.id)
            : [],
        );
        list = list.filter((t) =>
          taskBelongsToMeFilter(t, currentUserId, myAssigneeIds),
        );
      } else if (responsibleFilter) {
        // Multi-responsable + participantes: el filtro del dropdown
        // pasa por taskMatchesAssigneeFilter. Si el assignee elegido
        // tiene users linkeados, tambien se incluyen las juntas
        // donde alguno es participante.
        const filterAssignee = assignees.find(
          (a) => a.id === responsibleFilter,
        );
        if (filterAssignee) {
          list = list.filter((t) =>
            taskMatchesAssigneeFilter(t, filterAssignee),
          );
        } else {
          list = list.filter((t) => taskHasAssignee(t, responsibleFilter));
        }
      }
    }

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(term) ||
          (t.description?.toLowerCase().includes(term) ?? false),
      );
    }

    return list;
  }, [
    tasksApi.tasks,
    projectFilter,
    responsibleFilter,
    searchTerm,
    capabilities.projects,
    capabilities.responsibles,
    assignees,
    currentUserId,
  ]);

  const pendingApprovalTasks = useMemo(() => {
    if (!capabilities.approvals) return [];
    return filteredTasks.filter(
      (t) => t.requiresApproval && !t.approved && !t.rejected,
    );
  }, [filteredTasks, capabilities.approvals]);

  const quadrantTasks = useMemo(() => {
    if (!capabilities.approvals) return filteredTasks;
    return filteredTasks.filter(
      (t) => !(t.requiresApproval && !t.approved && !t.rejected),
    );
  }, [filteredTasks, capabilities.approvals]);

  const tasksByQuadrant = useMemo(() => {
    const map: Record<QuadrantKey, Task[]> = {
      do: [],
      plan: [],
      delegate: [],
      later: [],
    };
    for (const task of quadrantTasks) {
      map[task.quadrant].push(task);
    }
    return map;
  }, [quadrantTasks]);

  // Conteo por cuadrante para el mini-navigator de mobile. Se calcula
  // sobre quadrantTasks (post filtros + sin pendientes de aprobacion)
  // asi los numeros del navigator coinciden con lo visible abajo.
  const countsByQuadrant = useMemo(() => {
    const counts: Record<QuadrantKey, number> = {
      do: 0,
      plan: 0,
      delegate: 0,
      later: 0,
    };
    for (const task of quadrantTasks) {
      counts[task.quadrant]++;
    }
    return counts;
  }, [quadrantTasks]);

  const assigneesById = useMemo(
    () => new Map(assignees.map((a) => [a.id, a])),
    [assignees],
  );
  const projectsById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const totalCount = filteredTasks.length;
  const grandTotal = tasksApi.tasks.length;
  const isFiltered = totalCount !== grandTotal;

  function openCreate(quadrant: QuadrantKey) {
    setFormState({ open: true, task: null, initialQuadrant: quadrant });
  }

  function openEdit(task: Task) {
    setFormState({
      open: true,
      task,
      initialQuadrant: task.quadrant,
    });
  }

  function closeForm() {
    setFormState((s) => ({ ...s, open: false }));
    // Si el editor se abrio por "Cancelar envio" del toast, el
    // GraceProvider quedo pausado. Si el user guardo, handleSubmit ya
    // llamo a bump() que limpia la pausa — entonces este resume es
    // no-op. Si cerro sin guardar, reanudamos el cronometro desde
    // donde quedo. Idempotente: safe para llamar siempre.
    grace.resume();
  }

  async function handleSubmit(
    values: CreateTaskInput | UpdateTaskInput,
    mode: "create" | "update",
  ) {
    if (mode === "create") {
      const create = values as CreateTaskInput;
      const defaultProjectId =
        capabilities.projects &&
        projectFilter !== "all" &&
        projectFilter !== "none"
          ? projectFilter
          : (create.projectId ?? null);
      // Spread + override de projectId. Esto evita el bug historico
      // donde cada vez que el dominio sumaba un campo (assigneeIds en
      // Sprint A, kind/startAt/etc en Sprint B), habia que recordar
      // listarlo aca o se perdia silenciosamente. El form sabe que
      // mandar; aca solo aplicamos el filtro de proyecto activo.
      const created = await tasksApi.create({
        ...create,
        projectId: defaultProjectId,
      });
      // Mig 0076: si el server devolvio la tarea con submit_finalized_at
      // = NULL, esta en grace. Arrancamos el toast de undo-send. El
      // server ya seteo grace_started_at; el countdown del client es
      // aproximacion — pg_cron es la verdad y publica cuando toque.
      if (
        created &&
        created.submitFinalizedAt === null &&
        created.graceStartedAt &&
        myApprovalGraceSeconds > 0
      ) {
        grace.start(
          created,
          myApprovalGraceSeconds,
          (task) => {
            // "Cancelar envio" del toast: el provider ya pauso el
            // cronometro. Aca re-abrimos el form con la tarea (sigue
            // editable porque submit_finalized_at IS NULL y el autor
            // tiene policy UPDATE sobre su propia tarea). Si guarda,
            // handleSubmit llamara a grace.bump() para reiniciar la
            // ventana; si cierra sin guardar, closeForm llama a
            // grace.resume() y el cronometro retoma.
            setFormState({
              open: true,
              task,
              initialQuadrant: task.quadrant,
            });
          },
        );
      }
    } else {
      if (!formState.task) return;
      const updated = await tasksApi.update(
        formState.task.id,
        values as UpdateTaskInput,
      );
      // Mig 0076: si la tarea editada sigue en grace, el trigger BD
      // ya bumpeo grace_started_at — reflejamos en el toast para que
      // el countdown reinicie. Si no hay toast activo (caso editar
      // fuera de grace), bump es no-op.
      if (
        updated &&
        updated.submitFinalizedAt === null &&
        updated.graceStartedAt
      ) {
        grace.bump(updated);
      }
    }
  }

  async function handleConfirmDelete() {
    if (!taskToDelete) return;
    const id = taskToDelete.id;
    setTaskToDelete(null);
    await tasksApi.remove(id);
  }

  // Handler para "Mover a cuadrante" desde el menu "..." de TaskCard.
  // Mismo efecto que el drag pero accesible en mobile (donde el drag
  // entre cuadrantes esta deshabilitado por la vista 2x2 con foco).
  async function handleMoveTask(task: Task, target: QuadrantKey) {
    if (task.quadrant === target) return;
    await tasksApi.update(task.id, { quadrant: target });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const targetQuadrant = (over.data.current?.quadrant as
      | QuadrantKey
      | undefined) ?? null;
    if (!targetQuadrant) return;

    const task = tasksApi.tasks.find((t) => t.id === taskId);
    if (!task || task.quadrant === targetQuadrant) return;

    await tasksApi.update(taskId, { quadrant: targetQuadrant });
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
            {title ?? "Cuadrantes"}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {grandTotal === 0
              ? (emptyText ?? "Sin tareas activas. Crea la primera para empezar.")
              : isFiltered
                ? `${totalCount} de ${grandTotal} tareas según los filtros`
                : `${grandTotal} ${grandTotal === 1 ? "tarea activa" : "tareas activas"}`}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <ViewModeToggle
            value={viewMode}
            onChange={setViewMode}
            showKpis={capabilities.projects}
          />

          {capabilities.members &&
            activeWorkspace?.type === "family" &&
            (isFamilyFull ? (
              // Plan lleno: chip informativo, no clickeable. La gestion
              // (revocar, etc.) sigue accesible desde MembersPanel.
              <span
                title="Para sumar mas personas, revoca alguna invitacion pendiente o aumenta el plan"
                className="hidden items-center gap-1.5 rounded-xl border border-line bg-surface-muted px-3.5 py-2.5 text-sm font-semibold text-ink-soft md:inline-flex"
              >
                <Check size={14} />
                Familia completa
              </span>
            ) : (
              // Boton normal. Oculto en mobile: el flow de invitar en
              // mobile va por el chip discreto de SpaceToolbar (mig
              // mobile UX). Sin esto, el usuario veria dos triggers.
              <button
                type="button"
                onClick={() => setShowMembersPanel(true)}
                className={cn(
                  "hidden items-center gap-1.5 rounded-xl border border-prio-green/30 bg-white px-3.5 py-2.5 text-sm font-semibold text-prio-green shadow-soft md:inline-flex",
                  "transition-all hover:-translate-y-0.5 hover:bg-prio-green/5",
                )}
              >
                <UserPlus size={14} />
                Invitar familia
              </button>
            ))}

          <button
            type="button"
            onClick={() => openCreate("do")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-soft",
              "transition-all hover:-translate-y-0.5 hover:bg-ink/90",
              // Dark mode: contorno visible para que el CTA primario
              // se distinga del slate-900 del fondo + cards slate-800.
              "dark:ring-1 dark:ring-white/15 dark:hover:ring-white/25",
            )}
          >
            <Plus size={14} />
            Nueva tarea
          </button>
        </div>
      </header>

      {/* First-run onboarding: only show on Trabajo when nothing exists yet */}
      {capabilities.projects &&
        capabilities.responsibles &&
        grandTotal === 0 &&
        projects.length === 0 &&
        assignees.length === 0 &&
        !tasksApi.isLoading && (
          <TeamOnboardingBanner
            onCreateProject={() => setShowProjectsPanel(true)}
            onCreateAssignee={() => setShowAssigneesPanel(true)}
            onCreateTask={() => openCreate("do")}
          />
        )}

      {/* Onboarding cuando una familia está vacía */}
      {capabilities.members &&
        !capabilities.projects &&
        activeWorkspace?.type === "family" &&
        grandTotal === 0 &&
        !tasksApi.isLoading && (
          <FamilyOnboardingBanner
            onInvite={() => setShowMembersPanel(true)}
            onCreateTask={() => openCreate("do")}
          />
        )}

      {showAnyToolbar && (
        <SpaceToolbar
          showProjects={capabilities.projects}
          projects={projects}
          projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter}
          onOpenProjects={
            capabilities.projects
              ? () => setShowProjectsPanel(true)
              : undefined
          }
          showResponsibles={capabilities.responsibles}
          assignees={assignees}
          responsibleFilter={responsibleFilter}
          onResponsibleFilterChange={setResponsibleFilter}
          onOpenAssignees={
            capabilities.responsibles
              ? () => setShowAssigneesPanel(true)
              : undefined
          }
          peopleLabel={peopleLabel}
          onOpenMembers={
            capabilities.members
              ? () => setShowMembersPanel(true)
              : undefined
          }
          isFamilyWorkspace={activeWorkspace?.type === "family"}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          currentUserId={currentUserId}
        />
      )}

      {!showAnyToolbar && (
        // Personal: just a search input (no projects/responsibles)
        <SpaceToolbar
          showProjects={false}
          projects={[]}
          projectFilter="all"
          onProjectFilterChange={() => {}}
          showResponsibles={false}
          assignees={[]}
          responsibleFilter=""
          onResponsibleFilterChange={() => {}}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      )}

      {capabilities.approvals && (
        <ApprovalsBanner
          tasks={pendingApprovalTasks}
          assigneesById={assigneesById}
          projectsById={projectsById}
          currentUserId={currentUserId}
          canManage={canApprove}
          onResolved={() => {
            void tasksApi.refresh();
          }}
          profilesById={profilesById}
          rolesByUserId={rolesByUserId}
          workspaceType={activeWorkspace?.type ?? null}
        />
      )}

      {tasksApi.error ? (
        <ErrorState
          message={friendlyError(new Error(tasksApi.error))}
          onRetry={() => void tasksApi.refresh()}
        />
      ) : tasksApi.isLoading ? (
        <LoadingState text="Cargando tareas…" className="p-12" />
      ) : viewMode === "kpis" ? (
        <Suspense fallback={<LoadingState text="Cargando indicadores…" className="p-12" />}>
          <KpisView
            space={space}
            projectFilter={projectFilter}
            responsibleFilter={responsibleFilter}
            searchTerm={searchTerm}
            showProjectsFilter={capabilities.projects}
            showResponsiblesFilter={capabilities.responsibles}
          />
        </Suspense>
      ) : viewMode === "calendar" ? (
        <>
          {(subordinates.length > 0 || sharedSuperiors.length > 0) && (
            <AgendaScopeSelector
              value={agendaSubordinateId}
              onChange={setAgendaSubordinateId}
              subordinates={subordinates}
              sharedSuperiors={sharedSuperiors}
              actorRoleLabel={role ? roleLabel(role) : ""}
            />
          )}
          {(() => {
            // Mismo filtro de tasks (por subordinado opcional) que aplica
            // tanto al MonthCalendar (desktop) como al MobileWeekCalendar.
            const calendarTasks =
              subordinateAssigneeIds === null
                ? quadrantTasks
                : quadrantTasks.filter((t) => {
                    // Tareas: por assignees vinculados al subordinado.
                    // Juntas: tambien las que tienen al subordinado
                    // en participantIds (caso donde es participante
                    // pero no responsable formal).
                    if (
                      t.assigneeIds.some((id) =>
                        subordinateAssigneeIds.includes(id),
                      )
                    ) {
                      return true;
                    }
                    if (
                      agendaSubordinateId &&
                      t.participantIds.includes(agendaSubordinateId)
                    ) {
                      return true;
                    }
                    return false;
                  });

            // heatmapTasks: subset filtrado a tareas del USUARIO actual
            // (o del subordinado si esta seleccionado). Asi el coloreado
            // amarillo/naranja/rojo refleja la carga personal, no la
            // carga total visible. Cuando hay subordinado seleccionado,
            // calendarTasks ya esta filtrado a el, asi que reusamos.
            const heatmapTasks =
              subordinateAssigneeIds !== null
                ? calendarTasks
                : (() => {
                    const myAssigneeIds = new Set(
                      currentUserId
                        ? assignees
                            .filter(
                              (a) =>
                                (a.linkedUserIds &&
                                  a.linkedUserIds.includes(currentUserId)) ||
                                a.linkedUserId === currentUserId,
                            )
                            .map((a) => a.id)
                        : [],
                    );
                    return calendarTasks.filter((t) =>
                      taskBelongsToMeFilter(
                        t,
                        currentUserId,
                        myAssigneeIds,
                      ),
                    );
                  })();
            return (
              <>
                {/* Mobile: mini-mes (panorama) + lista semanal (consulta). */}
                <div className="md:hidden">
                  {/* Mobile: calendario solo para CONSULTA. Las
                      tareas se muestran como chips no interactivos
                      (no abren editor). Para editar, ir a Cuadrantes. */}
                  <MobileWeekCalendar
                    tasks={calendarTasks}
                    heatmapTasks={heatmapTasks}
                  />
                </div>
                {/* Desktop: grid mensual completo con tareas inline. */}
                <div className="hidden md:block">
                  <MonthCalendar
                    tasks={calendarTasks}
                    heatmapTasks={heatmapTasks}
                    onTaskClick={(task) => openEdit(task)}
                  />
                </div>
              </>
            );
          })()}
          <CompletedTasksSection
            space={space}
            assigneesById={assigneesById}
            projectsById={projectsById}
            onUncompleted={() => void tasksApi.refresh()}
          />
        </>
      ) : (
        <>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {/* Mobile (<md): mini-navigator 2x2 sticky + UN cuadrante
                en full-width. Conserva la marca visual de los 4
                cuadrantes (logo de PRIO) sin sacrificar legibilidad
                de las TaskCards. */}
            <div className="md:hidden">
              <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-white px-4 py-2 shadow-sm">
                <QuadrantsMiniNavigator
                  focused={focusedQuadrant}
                  onFocus={handleFocusQuadrant}
                  countsByQuadrant={countsByQuadrant}
                />
              </div>
              <QuadrantColumn
                meta={QUADRANTS[focusedQuadrant]}
                tasks={tasksByQuadrant[focusedQuadrant]}
                assigneesById={assigneesById}
                projectsById={projectsById}
                profilesById={profilesById}
                showCreator={capabilities.projects}
                onAddTask={() => openCreate(focusedQuadrant)}
                onEditTask={openEdit}
                onDeleteTask={setTaskToDelete}
                onToggleComplete={tasksApi.toggleComplete}
                canEditTask={canEditTask}
                canDeleteTask={canDeleteTask}
                onMoveTask={handleMoveTask}
              />
            </div>

            {/* Desktop (md+): grid 2x2 con los 4 cuadrantes a la vez. */}
            <div className="hidden md:grid md:grid-cols-2 md:gap-4">
              {QUADRANT_ORDER.map((key) => (
                <QuadrantColumn
                  key={key}
                  meta={QUADRANTS[key]}
                  tasks={tasksByQuadrant[key]}
                  assigneesById={assigneesById}
                  projectsById={projectsById}
                  profilesById={profilesById}
                  showCreator={capabilities.projects}
                  onAddTask={() => openCreate(key)}
                  onEditTask={openEdit}
                  onDeleteTask={setTaskToDelete}
                  onToggleComplete={tasksApi.toggleComplete}
                  canEditTask={canEditTask}
                  canDeleteTask={canDeleteTask}
                  onMoveTask={handleMoveTask}
                />
              ))}
            </div>
          </DndContext>

          <CompletedTasksSection
            space={space}
            assigneesById={assigneesById}
            projectsById={projectsById}
            onUncompleted={() => void tasksApi.refresh()}
          />
        </>
      )}

      {formState.open && (
        <TaskFormDialog
          task={formState.task}
          defaults={{
            space,
            quadrant: formState.initialQuadrant,
            projectId:
              capabilities.projects &&
              projectFilter !== "all" &&
              projectFilter !== "none"
                ? projectFilter
                : null,
          }}
          projects={projects}
          assignees={assignees}
          profiles={Array.from(profilesById.values())}
          showProjects={capabilities.projects}
          showResponsibles={capabilities.responsibles}
          showApproval={capabilities.approvals}
          onSubmit={handleSubmit}
          onClose={closeForm}
        />
      )}

      {taskToDelete && (
        <ConfirmDialog
          title="Eliminar tarea"
          message={`Vas a eliminar "${taskToDelete.title}". Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setTaskToDelete(null)}
        />
      )}

      <Suspense fallback={null}>
        {showProjectsPanel && (
          <ProjectsPanel onClose={() => setShowProjectsPanel(false)} />
        )}

        {showAssigneesPanel && (
          <AssigneesPanel
            onClose={() => setShowAssigneesPanel(false)}
            peopleLabel={peopleLabel}
          />
        )}

        {showMembersPanel && (
          <MembersPanel
            onClose={() => setShowMembersPanel(false)}
            workspaceKind={
              activeWorkspace?.type === "family" ? "family" : "team"
            }
          />
        )}
      </Suspense>
    </div>
  );
}
