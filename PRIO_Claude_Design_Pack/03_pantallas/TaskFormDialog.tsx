import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { X } from "lucide-react";
import { useModalEnter } from "@/components/useModalEnter";
import { useBackdropDismiss } from "@/components/useBackdropDismiss";
import type {
  Assignee,
  CreateTaskInput,
  Profile,
  Project,
  Quadrant,
  Space,
  Task,
  TaskKind,
  UpdateTaskInput,
  WorkspaceRole,
} from "@/types";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/components/State";
import { Field } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { useMyWorkspaceRole } from "@/features/workspaces/useMyWorkspaceRole";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useWorkspaceMembers } from "@/features/workspaces/useWorkspaceMembers";
import { roleLabel, roleRankFor } from "@/features/workspaces/roleHierarchy";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  addMinutesLocal,
  datetimeLocalToIso,
  isoToDatetimeLocal,
  nextHalfHourLocal,
} from "@/features/tasks/dates";
import { TaskFormKindToggle } from "@/features/tasks/components/TaskFormKindToggle";
import { TaskFormQuadrantPicker } from "@/features/tasks/components/TaskFormQuadrantPicker";
import { TaskFormMeetingFields } from "@/features/tasks/components/TaskFormMeetingFields";
import { TaskFormApprovalField } from "@/features/tasks/components/TaskFormApprovalField";
import { TaskHistorySection } from "@/features/tasks/components/TaskHistorySection";
import { TaskFormResponsiblesField } from "@/features/tasks/components/TaskFormResponsiblesField";
import { useBlockedDays } from "@/features/blockedDays/useBlockedDays";

interface TaskFormDialogProps {
  task: Task | null;
  defaults: {
    space: Space;
    quadrant: Quadrant;
    projectId?: string | null;
  };
  projects: Project[];
  assignees: Assignee[];
  /**
   * Profiles del workspace, necesarios para el selector de
   * participantes cuando kind=meeting. Se pasan vacios para tasks.
   */
  profiles?: Profile[];
  /** If false, project field is hidden in the form */
  showProjects: boolean;
  /** If false, responsible field is hidden in the form */
  showResponsibles: boolean;
  /** If false, the approval toggle is hidden */
  showApproval: boolean;
  onSubmit: (
    values: CreateTaskInput | UpdateTaskInput,
    mode: "create" | "update",
  ) => Promise<void>;
  onClose: () => void;
}

/**
 * Modal de crear/editar tarea o junta. Orquesta state, validaciones y
 * submit; el render se delega en sub-componentes por section
 * (KindToggle, QuadrantPicker, MeetingFields, ResponsiblesField,
 * ApprovalField). Helpers de fecha y el wrapper Field viven fuera.
 *
 * Fase 4 del roadmap: este archivo estaba en ~860 lineas y era
 * error-prone para edits grandes con el bug de null bytes. El split
 * lo redujo a algo manejable; cada section es un archivo aparte con
 * props explicitas.
 */
export function TaskFormDialog({
  task,
  defaults,
  projects,
  assignees,
  profiles = [],
  showProjects,
  showResponsibles,
  showApproval,
  onSubmit,
  onClose,
}: TaskFormDialogProps) {
  const isEdit = task !== null;
  const titleInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { role } = useMyWorkspaceRole();
  const isManagerCreator = role === "owner" || role === "admin";
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const { activeWorkspace } = useWorkspace();
  const workspaceType = activeWorkspace?.type ?? null;
  // Para Fase 2 (hierarchy enforcement) necesitamos saber el rol de
  // cada user vinculado a un assignee. useWorkspaceMembers ya expone
  // memberships con realtime, asi que se mantiene fresco si alguien
  // cambia de rol mientras el modal esta abierto.
  const { members: workspaceMembers } = useWorkspaceMembers();
  const roleByUserId = useMemo(() => {
    const m = new Map<string, WorkspaceRole>();
    for (const { member } of workspaceMembers) {
      m.set(member.userId, member.role);
    }
    return m;
  }, [workspaceMembers]);

  // ─── Form state ────────────────────────────────────────────
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [quadrant, setQuadrant] = useState<Quadrant>(
    task?.quadrant ?? defaults.quadrant,
  );
  const [projectId, setProjectId] = useState<string>(
    task?.projectId ?? defaults.projectId ?? "",
  );
  // Multi-responsable. El primero del array es el "principal" (cache
  // de tasks.responsible_assignee_id). Para compat con tareas viejas
  // mapeadas antes del junction, fallback a responsibleAssigneeId.
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task
      ? task.assigneeIds.length > 0
        ? task.assigneeIds
        : task.responsibleAssigneeId
          ? [task.responsibleAssigneeId]
          : []
      : [],
  );
  const [dueDate, setDueDate] = useState<string>(task?.dueDate ?? "");
  const [requiresApproval, setRequiresApproval] = useState<boolean>(
    task?.requiresApproval ?? false,
  );

  // Sprint B: kind + meeting fields
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? "task");
  const initialStart = useMemo(
    () => isoToDatetimeLocal(task?.startAt ?? null),
    [task?.startAt],
  );
  const initialEnd = useMemo(
    () => isoToDatetimeLocal(task?.endAt ?? null),
    [task?.endAt],
  );
  const [startAt, setStartAt] = useState<string>(initialStart);
  const [endAt, setEndAt] = useState<string>(initialEnd);
  const [location, setLocation] = useState<string>(task?.location ?? "");
  const [meetingLink, setMeetingLink] = useState<string>(
    task?.meetingLink ?? "",
  );
  const [participantIds, setParticipantIds] = useState<string[]>(
    task?.participantIds ?? [],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const space = task?.space ?? defaults.space;
  const projectsAvailable = showProjects && projects.length > 0;
  const isMeeting = kind === "meeting";

  // ─── Computed: approval forzado por asignar a otro ────────────
  // Member que asigna o invita a OTRO user → trigger DB fuerza
  // requires_approval=true (mig 0028). Banner avisa antes de guardar.
  // EXCEPTO en workspaces family — mig 0051 deshabilita aprobaciones ahi.
  const willForceApprovalByOtherAssign = useMemo(() => {
    if (workspaceType === "family") return false;
    if (isManagerCreator || !currentUserId) return false;
    if (isMeeting) {
      return participantIds.some((pid) => pid !== currentUserId);
    }
    return assigneeIds.some((aid) => {
      const a = assignees.find((x) => x.id === aid);
      if (!a) return false;
      // Multi-vinculado: si CUALQUIERA de los users vinculados es
      // distinto al caller, la asignacion va a OTRO user y dispara
      // approval forzado (mig 0028 lo enforza en DB).
      const ids =
        a.linkedUserIds && a.linkedUserIds.length > 0
          ? a.linkedUserIds
          : a.linkedUserId
            ? [a.linkedUserId]
            : [];
      return ids.some((id) => id !== currentUserId);
    });
  }, [
    workspaceType,
    isManagerCreator,
    currentUserId,
    isMeeting,
    participantIds,
    assigneeIds,
    assignees,
  ]);

  // ─── Computed: hierarchy warning (Fase 2) ────────────────────
  // Mapa de assignees que necesitan aprobacion por rango actor vs
  // target. NO bloquean la seleccion — el user puede elegirlos —
  // pero al hacerlo aparece banner + submit deshabilitado hasta que
  // marque "Requiere aprobacion". Espejo del trigger DB
  // `guard_task_assignee_hierarchy` (mig 0031/0035) que SI bloquea
  // a nivel DB si llega un INSERT sin aprobacion.
  const hierarchyWarningMap = useMemo(() => {
    const result: Record<string, string> = {};
    // En family no hay jerarquia de aprobacion (mig 0051). Owner=admin
    // mismo rank (mig 0036), y aprobaciones no aplican.
    if (workspaceType === "family") return result;
    if (!role || !currentUserId) return result;
    if (requiresApproval) return result;
    const actorRank = roleRankFor(role, workspaceType);

    // Multi-vinculado (mig 0034): un assignee bloquea SOLO si TODOS
    // sus users vinculados son de mayor rango. Espejo de la nueva
    // logica del trigger guard_task_assignee_hierarchy (mig 0035).
    for (const a of assignees) {
      // Fallback al linkedUserId (cache del primary) por compat.
      const linkedIds =
        a.linkedUserIds && a.linkedUserIds.length > 0
          ? a.linkedUserIds
          : a.linkedUserId
            ? [a.linkedUserId]
            : [];

      // Etiqueta libre (sin vinculos) → no bloquear.
      if (linkedIds.length === 0) continue;

      // Self entre los vinculados → no bloquear.
      if (linkedIds.includes(currentUserId)) continue;

      // Calculamos el menor rank entre los vinculados. Si AL MENOS
      // UNO es igual o menor al actor, no bloqueamos. Si TODOS son
      // mayores, sí.
      let minTargetRank = Infinity;
      let highestRoleLabel = "";
      for (const userId of linkedIds) {
        const targetRole = roleByUserId.get(userId);
        if (!targetRole) continue;
        const r = roleRankFor(targetRole, workspaceType);
        if (r < minTargetRank) {
          minTargetRank = r;
          highestRoleLabel = roleLabel(targetRole);
        }
      }

      // Sin ningun vinculado que sea miembro del workspace (caso
      // degenerado): no bloquear, el trigger DB lo permite igual.
      if (minTargetRank === Infinity) continue;

      if (actorRank < minTargetRank) {
        result[a.id] =
          `Para asignar a esta etiqueta (responsables ${highestRoleLabel} o superior) ` +
          `necesitas activar "Requiere aprobacion".`;
      }
    }
    return result;
  }, [role, currentUserId, requiresApproval, assignees, roleByUserId, workspaceType]);

  // Selecciones previas que ahora violan jerarquia (porque el toggle
  // de approval esta apagado). Mostramos banner + deshabilitamos submit.
  const hierarchyViolations = useMemo(() => {
    if (requiresApproval) return [] as Assignee[];
    const out: Assignee[] = [];
    for (const id of assigneeIds) {
      if (hierarchyWarningMap[id]) {
        const a = assignees.find((x) => x.id === id);
        if (a) out.push(a);
      }
    }
    return out;
  }, [assigneeIds, assignees, hierarchyWarningMap, requiresApproval]);

  // ─── Computed: bloqueos de dia (Fase 1, mig 0058) ─────────────
  // Fecha efectiva del item: para junta es la fecha del start; para
  // tarea es el deadline. Si no hay fecha, no hay nada que chequear.
  const effectiveBlockDate = useMemo(() => {
    if (isMeeting) {
      // startAt en formato datetime-local (YYYY-MM-DDTHH:MM).
      if (startAt && startAt.length >= 10) return startAt.slice(0, 10);
      return "";
    }
    return dueDate;
  }, [isMeeting, startAt, dueDate]);

  // Targets a chequear: en meetings, los participantes; en tasks, los
  // users vinculados a las etiquetas seleccionadas. Excluimos al
  // creador — si te bloqueaste a vos mismo no tiene sentido warnearte.
  const blockedTargetIds = useMemo(() => {
    const ids = new Set<string>();
    if (isMeeting) {
      for (const pid of participantIds) {
        if (pid && pid !== currentUserId) ids.add(pid);
      }
    } else {
      for (const aid of assigneeIds) {
        const a = assignees.find((x) => x.id === aid);
        if (!a) continue;
        const linkedIds =
          a.linkedUserIds && a.linkedUserIds.length > 0
            ? a.linkedUserIds
            : a.linkedUserId
              ? [a.linkedUserId]
              : [];
        for (const uid of linkedIds) {
          if (uid && uid !== currentUserId) ids.add(uid);
        }
      }
    }
    return ids;
  }, [
    isMeeting,
    participantIds,
    assigneeIds,
    assignees,
    currentUserId,
  ]);

  // Hook se llama siempre (regla de hooks). Si effectiveBlockDate es
  // string vacio, internamente devuelve [] sin pegarle al RPC.
  const { blocksByUser: blockedDayBlocksByUser } = useBlockedDays({
    from: effectiveBlockDate,
    to: effectiveBlockDate,
  });

  // Warnings concretos: por cada user objetivo con bloqueo en la
  // fecha, una entrada con nombre, reason y horario. No bloquea
  // submit — solo aviso (Fase 1: regla soft).
  const blockedDayWarnings = useMemo(() => {
    if (!effectiveBlockDate || blockedTargetIds.size === 0) return [];
    const out: {
      userId: string;
      userName: string;
      reason: string | null;
      timeRange: string | null;
    }[] = [];
    for (const uid of blockedTargetIds) {
      const blocks = blockedDayBlocksByUser.get(uid) ?? [];
      for (const b of blocks) {
        out.push({
          userId: uid,
          userName: b.userName ?? b.userEmail ?? "Esta persona",
          reason: b.reason,
          timeRange:
            b.startTime && b.endTime
              ? `${b.startTime.slice(0, 5)} – ${b.endTime.slice(0, 5)}`
              : null,
        });
      }
    }
    return out;
  }, [effectiveBlockDate, blockedTargetIds, blockedDayBlocksByUser]);

  /**
   * Wrapper para cambiar de tarea↔junta. Al activar "Junta" por
   * primera vez, sembramos start/end con la proxima media hora + 1h
   * y auto-agregamos al creador como participante (mismo patron que
   * Outlook/Calendar). Al volver a "Tarea" no limpiamos los meeting
   * fields en state — el submit los ignora si kind final es "task".
   */
  function changeKind(next: TaskKind) {
    if (next === "meeting" && !startAt) {
      const seed = nextHalfHourLocal();
      setStartAt(seed);
      setEndAt(addMinutesLocal(seed, 60));
    }
    if (next === "meeting" && participantIds.length === 0 && currentUserId) {
      setParticipantIds([currentUserId]);
    }
    setKind(next);
  }

  useEffect(() => {
    // preventScroll: true evita que el browser scrollee el ancestro
    // con overflow para "asegurar visibilidad" del input enfocado, lo
    // cual pelea con el smooth-scroll de useModalEnter y rebota el
    // modal arriba. Soportado en Chromium 2017+, Firefox 68+, Safari
    // 17.4+. En Safari viejo se ignora silenciosamente (cohorte chica).
    titleInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("El título es obligatorio");
      return;
    }

    setSubmitting(true);
    try {
      const wantsApproval = showApproval && requiresApproval;
      const isResubmit = isEdit && (task?.rejected ?? false);

      // Validacion meeting client-side: la API tira el mismo error,
      // pero darlo aca evita el round-trip y muestra inline antes.
      if (isMeeting) {
        if (!startAt || !endAt) {
          setError("Las juntas requieren hora de inicio y de fin.");
          setSubmitting(false);
          return;
        }
        if (endAt <= startAt) {
          setError("La hora de fin debe ser posterior al inicio.");
          setSubmitting(false);
          return;
        }
      }

      const startAtIso = isMeeting ? datetimeLocalToIso(startAt) : null;
      const endAtIso = isMeeting ? datetimeLocalToIso(endAt) : null;

      // Para meetings forzamos due_date = date(startAt) en local — asi
      // calendario y filtros funcionan igual que con tareas.
      const effectiveDueDate = isMeeting
        ? startAt.slice(0, 10)
        : dueDate || null;

      // Si el caller es member y asigno a otro user, requires_approval
      // se fuerza a true (mig 0028 lo respalda con trigger). Aca lo
      // mandamos explicito por defensa en profundidad.
      const effectiveRequiresApproval = willForceApprovalByOtherAssign
        ? true
        : showApproval
          ? requiresApproval
          : false;

      if (isEdit) {
        const update: UpdateTaskInput = {
          kind,
          title: cleanTitle,
          description: description.trim() || null,
          quadrant,
          projectId: showProjects ? projectId || null : null,
          // Solo incluir assigneeIds cuando showResponsibles=true.
          // Mandar `[]` con showResponsibles=false vacia el junction
          // (bug 2 Sprint B). Mismo razonamiento para participantIds.
          ...(showResponsibles ? { assigneeIds } : {}),
          dueDate: effectiveDueDate,
          startAt: startAtIso,
          endAt: endAtIso,
          location: isMeeting ? location.trim() || null : null,
          meetingLink: isMeeting ? meetingLink.trim() || null : null,
          ...(isMeeting ? { participantIds } : {}),
          requiresApproval: effectiveRequiresApproval,
        };

        // Defensa en profundidad: cuando un manager edita una tarea
        // rechazada, mandamos los flags explicitos. El trigger DB
        // hace lo mismo, pero asi garantizamos resultado correcto.
        if (isResubmit) {
          if (isManagerCreator) {
            update.rejected = false;
            update.approved = true;
            update.rejectionReason = null;
          } else if (task && task.createdBy && wantsApproval) {
            update.rejected = false;
            update.approved = false;
            update.rejectionReason = null;
          }
        }

        await onSubmit(update, "update");
      } else {
        const create: CreateTaskInput = {
          workspaceId: "",
          kind,
          title: cleanTitle,
          description: description.trim() || null,
          space,
          quadrant,
          projectId: showProjects ? projectId || null : null,
          ...(showResponsibles ? { assigneeIds } : {}),
          dueDate: effectiveDueDate,
          startAt: startAtIso,
          endAt: endAtIso,
          location: isMeeting ? location.trim() || null : null,
          meetingLink: isMeeting ? meetingLink.trim() || null : null,
          ...(isMeeting ? { participantIds } : {}),
          requiresApproval: effectiveRequiresApproval,
        };
        await onSubmit(create, "create");
      }

      // Toast contextual:
      //   - Manager que pidio aprobacion: la tarea se autoaprueba
      //     (trigger auto_approve_for_managers en mig 0016).
      //   - Member que pidio aprobacion: se envia a la cola.
      //   - Resubmit de tarea rechazada: vuelve a la cola.
      if (isResubmit && wantsApproval) {
        toast.success(
          "Tarea reenviada a aprobacion. Los managers fueron notificados.",
        );
      } else if (wantsApproval && isManagerCreator) {
        toast.success("Tarea creada y aprobada automaticamente.");
      } else if (wantsApproval) {
        toast.show({
          variant: "info",
          title: "Tarea enviada a aprobacion",
          description:
            "Owner y admin del workspace recibieron una notificacion. Te avisaremos cuando se apruebe o rechace.",
        });
      }

      onClose();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const hasProjectField = projectsAvailable;
  const hasResponsibleField = showResponsibles;
  const showProjectResponsibleRow = hasProjectField || hasResponsibleField;

  // Hook que bloquea body scroll mientras el modal esta abierto +
  // resetea scroll del backdrop. pageScrollAbsolute: 70 — scroll a la
  // misma posicion al abrir, sin importar donde este el user.
  const backdropRef = useModalEnter<HTMLDivElement>({
    pageScrollAbsolute: 70,
  });
  const onBackdropMouseDown = useBackdropDismiss(onClose);

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      // Backdrop SCROLLEABLE: si el modal excede viewport, el user
      // scrollea el backdrop. Modal anclado al top con padding.
      className="fixed inset-0 z-[100] overflow-y-auto bg-ink/30 backdrop-blur-sm animate-fade-in"
    >
      <div
        onMouseDown={onBackdropMouseDown}
        className="flex min-h-full justify-center px-3 py-3 md:px-4 md:py-4"
      >
        <div className="prio-modal-enter relative h-fit w-full rounded-2xl border border-line bg-white p-4 shadow-elevated md:max-w-lg md:rounded-3xl md:p-6">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted hover:text-ink"
          >
            <X size={16} />
          </button>

          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              {space}
            </span>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-ink">
              {isEdit
                ? isMeeting
                  ? "Editar junta"
                  : "Editar tarea"
                : isMeeting
                  ? "Nueva junta"
                  : "Nueva tarea"}
            </h2>
          </div>

          <TaskFormKindToggle value={kind} onChange={changeKind} />

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <Field label="Título">
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="¿Qué necesitas hacer?"
                required
                className={cn(
                  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink",
                  "placeholder:text-ink-muted",
                  "focus:border-prio-blue focus:outline-none focus:ring-4 focus:ring-prio-blue/15",
                )}
              />
            </Field>

            <Field label="Descripción" optional>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles adicionales (opcional)"
                rows={2}
                className={cn(
                  "w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink",
                  "placeholder:text-ink-muted",
                  "focus:border-prio-blue focus:outline-none focus:ring-4 focus:ring-prio-blue/15",
                )}
              />
            </Field>

            <TaskFormQuadrantPicker value={quadrant} onChange={setQuadrant} />

            {showProjectResponsibleRow && (
              <div
                className={cn(
                  "grid gap-4",
                  hasProjectField && hasResponsibleField && "sm:grid-cols-2",
                )}
              >
                {hasProjectField && (
                  <Field label="Proyecto" optional>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className={cn(
                        "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink",
                        "focus:border-prio-blue focus:outline-none focus:ring-4 focus:ring-prio-blue/15",
                      )}
                    >
                      <option value="">Sin proyecto</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                {hasResponsibleField && (
                  <TaskFormResponsiblesField
                    isMeeting={isMeeting}
                    assignees={assignees}
                    assigneeIds={assigneeIds}
                    onAssigneeIdsChange={setAssigneeIds}
                    hierarchyWarningMap={hierarchyWarningMap}
                    profiles={profiles}
                    participantIds={participantIds}
                    onParticipantIdsChange={setParticipantIds}
                  />
                )}
              </div>
            )}

            {isMeeting && (
              <TaskFormMeetingFields
                startAt={startAt}
                endAt={endAt}
                location={location}
                meetingLink={meetingLink}
                onStartAtChange={setStartAt}
                onEndAtChange={setEndAt}
                onLocationChange={setLocation}
                onMeetingLinkChange={setMeetingLink}
              />
            )}

            <div
              className={cn(
                "grid gap-4",
                showApproval && !isMeeting && "sm:grid-cols-2",
              )}
            >
              {!isMeeting && (
                <Field label="Fecha límite" optional>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={cn(
                      "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink",
                      "focus:border-prio-blue focus:outline-none focus:ring-4 focus:ring-prio-blue/15",
                    )}
                  />
                </Field>
              )}

              {showApproval && (
                <TaskFormApprovalField
                  value={requiresApproval}
                  onChange={setRequiresApproval}
                  taskRejected={task?.rejected ?? false}
                />
              )}
            </div>

            {willForceApprovalByOtherAssign && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Como esta {isMeeting ? "junta convoca" : "tarea asigna"} a otra persona,
                va a pasar por la cola de aprobacion del workspace antes de
                ser visible para los demas.
              </div>
            )}

            {/* Banner de dia bloqueado: solo en family (regla soft).
                En team/enterprise el guard del backend (mig 0061) ya
                rebota la operacion con un mensaje claro — mostrar el
                aviso soft aqui confunde porque sugiere que se puede
                continuar cuando en realidad el INSERT va a fallar.
                En personal el warning nunca se da porque no hay otros
                miembros que filtrar contra el currentUser. */}
            {blockedDayWarnings.length > 0 && workspaceType === "family" && (
              <div
                className={cn(
                  "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800",
                  "dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
                )}
              >
                <p className="font-semibold">
                  {blockedDayWarnings.length === 1
                    ? "Esta persona marco el dia como no disponible"
                    : "Estas personas marcaron el dia como no disponible"}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {blockedDayWarnings.map((w, idx) => (
                    <li key={`${w.userId}-${idx}`}>
                      <span className="font-medium">{w.userName}</span>
                      {w.timeRange ? ` (${w.timeRange})` : " (todo el dia)"}
                      {w.reason && (
                        <span className="italic"> — {w.reason}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] opacity-80">
                  Puedes continuar de todos modos — esto es solo un aviso.
                </p>
              </div>
            )}

            {hierarchyViolations.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold">
                  {hierarchyViolations.length === 1
                    ? "Esta asignacion necesita aprobacion"
                    : "Estas asignaciones necesitan aprobacion"}
                </p>
                <p className="mt-1">
                  Para asignar a{" "}
                  <span className="font-medium">
                    {hierarchyViolations.map((a) => a.name).join(", ")}
                  </span>{" "}
                  necesitas activar{" "}
                  <span className="font-semibold">"Requiere aprobacion"</span>{" "}
                  (son de rango superior). Tambien podes quitarlos si no
                  queres que aparezcan en la tarea.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  submitting ||
                  (willForceApprovalByOtherAssign && !requiresApproval) ||
                  hierarchyViolations.length > 0
                }
                title={
                  hierarchyViolations.length > 0
                    ? "Activa 'Requiere aprobacion' para asignar a esos responsables, o quitalos"
                    : willForceApprovalByOtherAssign && !requiresApproval
                      ? "Marca 'Requiere aprobacion' o quita al usuario externo"
                      : undefined
                }
                className={cn(
                  "rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white shadow-soft",
                  "transition-all hover:-translate-y-0.5 hover:bg-ink/90",
                  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
                )}
              >
                {submitting
                  ? "Guardando…"
                  : isEdit
                    ? "Guardar cambios"
                    : isMeeting
                      ? "Crear junta"
                      : "Crear tarea"}
              </button>
            </div>
          </form>
          {isEdit && task && (
            <div className="border-t border-line/60 px-6 py-2 dark:border-white/10">
              <TaskHistorySection taskId={task.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
