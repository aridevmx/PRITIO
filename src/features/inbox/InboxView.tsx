import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask, type SubtaskCounts } from "@/lib/mappers";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import { fetchSubtaskCounts } from "@/features/tasks/useTasks";
import { updateTask as apiUpdateTask, deleteTask as apiDeleteTask } from "@/features/tasks/api";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { BottomQuickAdd } from "@/features/inbox/BottomQuickAdd";
import { InboxListView } from "@/features/inbox/InboxListView";
import { emitAppEvent } from "@/lib/appEvents";
import { cn } from "@/lib/utils";
import { PRESET_COLORS } from "@/features/projects/presetColors";
import { listProjectsByWorkspaces } from "@/features/projects/api";
import { AppIcon } from "@/components/AppIcon";
import { CaretDoubleLeft, CaretRight, FunnelSimple } from "@phosphor-icons/react";
import { FilterBar } from "@/features/inbox/FilterBar";
import { FilterBuilderModal } from "@/features/inbox/FilterBuilderModal";
import { SavedFilters } from "@/features/inbox/SavedFilters";
import { applyFilterConditions, type UserFilter } from "@/features/inbox/filtersApi";
import { KanbanBoard } from "@/features/inbox/KanbanBoard";
import { PlanBoard } from "@/features/inbox/PlanBoard";
import type { SmartFilter } from "@/features/inbox/FilterBar";
import { useInboxViewPrefs } from "@/lib/viewPrefs";
import type { Task, Quadrant, Project } from "@/types";

type GroupMode = "workspace" | "cuadrante" | "proyecto" | "lista";

type InboxViewMode = "agrupado" | "plan" | "kanban" | "lista";

interface TaskGroup {
  key: string;
  label: string;
  dotClass?: string;
  dotColor?: string;
  count: number;
  tasks: Task[];
}

export function InboxView() {
  const { currentWorkspace, workspaces } = useWorkspace();
  const { toast } = useToast();
  const { hiddenViews: inboxHiddenViews } = useInboxViewPrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const autoFocus = Boolean((location.state as { quickfocus?: boolean } | null)?.quickfocus);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [quadrantFilter, setQuadrantFilter] = useState<Quadrant | null>(null);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<UserFilter | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(() => {
    try {
      return localStorage.getItem("pritio:inboxFiltersCollapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleFiltersCollapsed = useCallback(() => {
    setFiltersCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pritio:inboxFiltersCollapsed", next ? "1" : "0");
      } catch {
        // localStorage puede no estar disponible; el estado sigue funcionando.
      }
      return next;
    });
  }, []);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("workspace");
  const [inboxViewMode, setInboxViewMode] = useState<InboxViewMode>(() =>
    location.pathname === "/inbox/lista" && !inboxHiddenViews.includes("inbox-list")
      ? "lista"
      : "agrupado",
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);

  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});
  const profileCacheRef = useRef<Record<string, string>>({});

  const workspaceNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    workspaces.forEach((w) => {
      map[w.id] =
        w.type === "personal"
          ? "Personal"
          : w.type === "family"
            ? w.name
            : `Equipo: ${w.name}`;
    });
    if (currentWorkspace) {
      map[currentWorkspace.id] =
        currentWorkspace.type === "personal"
          ? "Personal"
          : currentWorkspace.type === "family"
            ? currentWorkspace.name
            : `Equipo: ${currentWorkspace.name}`;
    }
    return map;
  }, [workspaces, currentWorkspace]);

  const load = useCallback(async () => {
    const wsIds = workspaces.map((w) => w.id);
    if (wsIds.length === 0) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: taskRows } = await supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .in("workspace_id", wsIds)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      const rows = (taskRows ?? []) as unknown as Record<string, unknown>[];
      const taskIds = rows.map((r) => r.id as string);

      const { data: assigneeRows } = await supabase
        .from("task_assignees")
        .select("task_id, assignee_id")
        .in("task_id", taskIds);

      const assigneeMap = new Map<string, string[]>();
      (assigneeRows ?? []).forEach((row: Record<string, unknown>) => {
        const entries = assigneeMap.get(row.task_id as string) ?? [];
        entries.push(row.assignee_id as string);
        assigneeMap.set(row.task_id as string, entries);
      });

      let subtaskCounts: Map<string, SubtaskCounts> | undefined;
      try {
        subtaskCounts = await fetchSubtaskCounts(wsIds);
      } catch {
        // Los conteos son cosméticos; no deben romper Inbox.
      }

      try {
        setProjects(await listProjectsByWorkspaces(wsIds));
      } catch {
        // El agrupado por proyecto es opcional; no debe romper Inbox.
      }

      setTasks(rows.map((row) => mapTask(row as never, assigneeMap.get(row.id as string) ?? [], subtaskCounts?.get(row.id as string))));
    } catch {
      // realtime will sync
    } finally {
      setLoading(false);
    }
  }, [workspaces]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (autoFocus) emitAppEvent("pritio:create-task");
  }, [autoFocus]);

  useEffect(() => {
    const userIds = new Set<string>();
    tasks.forEach((t) => {
      if (t.createdBy) userIds.add(t.createdBy);
      t.assigneeIds.forEach((id) => userIds.add(id));
    });
    if (userIds.size === 0) return;
    const idsToFetch = [...userIds].filter((id) => !profileCacheRef.current[id]);
    if (idsToFetch.length === 0) {
      setProfileNameMap({ ...profileCacheRef.current });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", idsToFetch);
      (data ?? []).forEach((row: Record<string, unknown>) => {
        profileCacheRef.current[row.id as string] = (row.full_name as string | null) ?? "Usuario";
      });
      setProfileNameMap({ ...profileCacheRef.current });
    })();
  }, [tasks]);

  useEffect(() => {
    const onTasksChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ task: Task; workspaceId: string }>).detail;
      if (!detail?.task) return;
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === detail.task.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = detail.task;
          return next;
        }
        return [detail.task, ...prev];
      });
    };
    const onRefresh = () => void load();
    window.addEventListener("pritio:tasks-changed", onTasksChanged);
    window.addEventListener("pritio:app-refresh", onRefresh);
    window.addEventListener("pritio:synced", onRefresh);
    return () => {
      window.removeEventListener("pritio:tasks-changed", onTasksChanged);
      window.removeEventListener("pritio:app-refresh", onRefresh);
      window.removeEventListener("pritio:synced", onRefresh);
    };
  }, [load]);

  const applyUpdate = useCallback((updated: Task) => {
    setTasks((prev) =>
      prev.some((t) => t.id === updated.id)
        ? prev.map((t) => (t.id === updated.id ? updated : t))
        : [updated, ...prev],
    );
    window.dispatchEvent(
      new CustomEvent("pritio:tasks-changed", {
        detail: { task: updated, workspaceId: updated.workspaceId },
      }),
    );
  }, []);

  const handleToggleComplete = useCallback(
    async (task: Task) => {
      setPendingId(task.id);
      try {
        const updated = await apiUpdateTask(task.id, { completed: !task.completed, inboxed: false });
        applyUpdate(updated);
      } catch {
        // realtime will sync
      } finally {
        setPendingId(null);
      }
    },
    [applyUpdate],
  );

  const handleDelete = useCallback(async (task: Task) => {
    setPendingId(task.id);
    try {
      await apiDeleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch {
      // realtime will sync
    } finally {
      setPendingId(null);
      setDeleteTarget(null);
    }
  }, []);

  const handleOpenEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  }, []);

  const handleQuickAdd = useCallback(
    (title: string) => {
      emitAppEvent("pritio:create-task", { title });
    },
    [],
  );

  // Cambia de vista y normaliza la URL: /inbox/lista es un enlace heredado
  // que ahora vive dentro de Inbox, así que al salir volvemos a /inbox.
  const selectInboxViewMode = useCallback(
    (mode: InboxViewMode) => {
      setInboxViewMode(mode);
      if (location.pathname === "/inbox/lista") {
        navigate("/inbox", { replace: true });
      }
    },
    [location.pathname, navigate],
  );

  // Si la vista Lista se oculta desde Preferencias, volvemos a Agrupado.
  useEffect(() => {
    if (inboxViewMode === "lista" && inboxHiddenViews.includes("inbox-list")) {
      setInboxViewMode("agrupado");
      if (location.pathname === "/inbox/lista") navigate("/inbox", { replace: true });
    }
  }, [inboxViewMode, inboxHiddenViews, location.pathname, navigate]);

  const handleTaskMoveToDate = useCallback(
    async (taskId: string, newDate: string) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      // Actualización optimista: la tarjeta se mueve al soltar, sin esperar a la red.
      applyUpdate({ ...task, dueDate: newDate });
      try {
        const updated = await apiUpdateTask(taskId, { dueDate: newDate });
        applyUpdate(updated);
      } catch (error) {
        applyUpdate(task);
        console.error("No se pudo mover la tarea de día", error);
        toast.error("No se pudo mover la tarea. Revisa tu conexión.");
      }
    },
    [tasks, applyUpdate, toast],
  );

  const visibleTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

  const handleTaskMove = useCallback(
    async (taskId: string, newQuadrant: Quadrant) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.quadrant === newQuadrant) return;
      // Actualización optimista: la tarjeta cambia de columna al soltar.
      applyUpdate({ ...task, quadrant: newQuadrant });
      try {
        const updated = await apiUpdateTask(taskId, { quadrant: newQuadrant });
        applyUpdate(updated);
      } catch (error) {
        applyUpdate(task);
        console.error("No se pudo mover la tarea de cuadrante", error);
        toast.error("No se pudo mover la tarea. Revisa tu conexión.");
      }
    },
    [tasks, applyUpdate, toast],
  );

  const workspaceColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    workspaces.forEach((w, i) => {
      map[w.id] = PRESET_COLORS[i % PRESET_COLORS.length];
    });
    if (currentWorkspace && !map[currentWorkspace.id]) {
      map[currentWorkspace.id] = PRESET_COLORS[0];
    }
    return map;
  }, [workspaces, currentWorkspace]);

  const filteredVisible = useMemo(() => {
    let result = visibleTasks;
    if (quadrantFilter) {
      result = result.filter((t) => t.quadrant === quadrantFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    // Apply smart filters
    const today = new Date().toISOString().split("T")[0];
    switch (smartFilter) {
      case "overdue":
        result = result.filter((t) => t.dueDate && new Date(t.dueDate + "T00:00:00") < new Date());
        break;
      case "today":
        result = result.filter((t) => t.dueDate === today || t.startDate === today);
        break;
      case "noQuadrant":
        result = result.filter((t) => !t.quadrant || t.quadrant === "later");
        break;
      case "myDay":
        result = result.filter((t) => t.myDayDate !== null);
        break;
    }
    // Apply saved filter conditions
    if (activeFilter) {
      result = applyFilterConditions(result, activeFilter.conditions);
    }
    return result;
  }, [visibleTasks, quadrantFilter, searchQuery, smartFilter, activeFilter]);

  const groupsByWorkspace = useMemo<TaskGroup[]>(() => {
    const groups = new Map<string, TaskGroup>();
    workspaces.forEach((w) => {
      groups.set(w.id, { key: w.id, label: workspaceNameMap[w.id] ?? w.name, dotColor: workspaceColorMap[w.id], count: 0, tasks: [] });
    });
    let sinWorkspace: TaskGroup | null = null;
    for (const t of filteredVisible) {
      if (t.workspaceId && groups.has(t.workspaceId)) {
        const g = groups.get(t.workspaceId)!;
        g.count += 1;
        g.tasks.push(t);
      } else {
        sinWorkspace ??= { key: "sin-workspace", label: "General", dotClass: "bg-ink-muted", count: 0, tasks: [] };
        sinWorkspace.count += 1;
        sinWorkspace.tasks.push(t);
      }
    }
    const result = [...groups.values()].filter((g) => g.count > 0);
    if (sinWorkspace) result.push(sinWorkspace);
    return result;
  }, [filteredVisible, workspaces, workspaceNameMap, workspaceColorMap]);

  const groupsByQuadrant = useMemo<TaskGroup[]>(() => {
    return QUADRANT_ORDER.flatMap((key) => {
      const meta = QUADRANTS[key];
      if (!meta) return [];
      const matched = filteredVisible.filter((t) => t.quadrant === key);
      if (matched.length === 0) return [];
      return [
        {
          key,
          label: meta.title,
          dotClass: meta.classes.accentBg,
          count: matched.length,
          tasks: matched,
        },
      ];
    });
  }, [filteredVisible]);

  const groupsByProject = useMemo<TaskGroup[]>(() => {
    const groups = new Map<string, TaskGroup>();
    projects.forEach((p) => {
      groups.set(p.id, { key: p.id, label: p.name, dotColor: p.color, count: 0, tasks: [] });
    });
    let sinProyecto: TaskGroup | null = null;
    for (const t of filteredVisible) {
      if (t.projectId && groups.has(t.projectId)) {
        const g = groups.get(t.projectId)!;
        g.count += 1;
        g.tasks.push(t);
      } else {
        sinProyecto ??= { key: "sin-proyecto", label: "Sin proyecto", dotClass: "bg-ink-muted", count: 0, tasks: [] };
        sinProyecto.count += 1;
        sinProyecto.tasks.push(t);
      }
    }
    const result = [...groups.values()].filter((g) => g.count > 0);
    if (sinProyecto) result.push(sinProyecto);
    return result;
  }, [filteredVisible, projects]);

  const groups: TaskGroup[] =
    groupMode === "workspace"
      ? groupsByWorkspace
      : groupMode === "cuadrante"
        ? groupsByQuadrant
        : groupMode === "proyecto"
          ? groupsByProject
          : [{ key: "lista", label: "Todas", count: filteredVisible.length, tasks: filteredVisible }];

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const renderTask = (task: Task) => (
    <div key={task.id} className={cn("transition", pendingId === task.id && "opacity-60")}>
      <TaskCard
        task={task}
        onToggleComplete={handleToggleComplete}
        onEdit={handleOpenEdit}
        onDelete={(t) => setDeleteTarget(t)}
        responsableName={task.responsibleAssigneeId ? profileNameMap[task.responsibleAssigneeId] : undefined}
        creatorName={profileNameMap[task.createdBy]}
        workspaceName={workspaceNameMap[task.workspaceId]}
      />
    </div>
  );

  const renderGroupHeading = (group: TaskGroup) => {
    const collapsed = collapsedGroups.has(group.key);
    return (
      <button
        type="button"
        onClick={() => toggleGroup(group.key)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 rounded-lg px-1 pt-5 pb-1.5 text-left first:pt-2"
      >
        <AppIcon
          glyph={CaretRight}
          size="xs"
          className={cn(
            "shrink-0 text-ink-muted transition-transform duration-200",
            collapsed && "-rotate-90",
          )}
        />
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", group.dotClass)}
          style={group.dotColor ? { backgroundColor: group.dotColor } : undefined}
        />
        <h3 className="min-w-0 truncate text-sm font-bold text-ink">{group.label}</h3>
        <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-muted">
          {group.count}
        </span>
      </button>
    );
  };

  const header = (
    <div className="mb-5 px-4 pt-4">
      <p className="text-xs font-bold uppercase tracking-wider text-pritio-blue">Todas tus tareas</p>
      <h1 className="text-2xl font-extrabold text-ink">Inbox</h1>
      <p className="text-sm text-ink-muted">
        Vacía lo que traes en la cabeza, y luego organízalo: cuadrante, fecha o proyecto. Agrupa por workspace, cuadrante, proyecto o como lista.
      </p>
    </div>
  );

  const viewModeTabs = (
    <div className="px-4 mb-4">
      <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5 w-fit">
        <button
          type="button"
          onClick={() => selectInboxViewMode("agrupado")}
          aria-pressed={inboxViewMode === "agrupado"}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            inboxViewMode === "agrupado"
              ? "bg-ink text-white"
              : "text-ink-soft hover:bg-surface-muted hover:text-ink",
          )}
        >
          Agrupado
        </button>
        {!inboxHiddenViews.includes("inbox-plan") && (
          <button
            type="button"
            onClick={() => selectInboxViewMode("plan")}
            aria-pressed={inboxViewMode === "plan"}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              inboxViewMode === "plan"
                ? "bg-ink text-white"
                : "text-ink-soft hover:bg-surface-muted hover:text-ink",
            )}
          >
            Plan
          </button>
        )}
        {!inboxHiddenViews.includes("inbox-board") && (
          <button
            type="button"
            onClick={() => selectInboxViewMode("kanban")}
            aria-pressed={inboxViewMode === "kanban"}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              inboxViewMode === "kanban"
                ? "bg-ink text-white"
                : "text-ink-soft hover:bg-surface-muted hover:text-ink",
            )}
          >
            Tablero
          </button>
        )}
        {!inboxHiddenViews.includes("inbox-list") && (
          <button
            type="button"
            onClick={() => selectInboxViewMode("lista")}
            aria-pressed={inboxViewMode === "lista"}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              inboxViewMode === "lista"
                ? "bg-ink text-white"
                : "text-ink-soft hover:bg-surface-muted hover:text-ink",
            )}
          >
            Lista
          </button>
        )}
      </div>
    </div>
  );

  // La vista Lista se renderiza dentro de Inbox con su propio layout.
  if (inboxViewMode === "lista") {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {header}
        {viewModeTabs}
        <InboxListView />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {header}
      {viewModeTabs}

{inboxViewMode === "agrupado" && (
        <>
          {/* Sidebar + Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Saved Filters Sidebar — colapsable */}
            <aside
              className={cn(
                "hidden shrink-0 flex-col border-r border-line bg-surface/50 transition-[width] duration-200 lg:flex",
                filtersCollapsed ? "w-11 items-center py-3" : "w-56 p-3",
              )}
            >
              {filtersCollapsed ? (
                <button
                  type="button"
                  onClick={toggleFiltersCollapsed}
                  title="Mostrar filtros guardados"
                  aria-label="Mostrar filtros guardados"
                  aria-expanded={false}
                  className={cn(
                    "relative grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-surface-muted",
                    activeFilter ? "text-pritio-blue" : "text-ink-muted hover:text-ink",
                  )}
                >
                  <AppIcon glyph={FunnelSimple} size="sm" />
                  {activeFilter && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-pritio-blue" />
                  )}
                </button>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between gap-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      Filtros guardados
                    </p>
                    <button
                      type="button"
                      onClick={toggleFiltersCollapsed}
                      title="Ocultar filtros guardados"
                      aria-label="Ocultar filtros guardados"
                      aria-expanded={true}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                    >
                      <AppIcon glyph={CaretDoubleLeft} size="sm" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <SavedFilters
                      onApplyFilter={setActiveFilter}
                      activeFilterId={activeFilter?.id ?? null}
                      onClearFilter={() => setActiveFilter(null)}
                    />
                  </div>
                </>
              )}
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Bar */}
              <div className="px-4 mb-4">
                <FilterBar
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  activeSmartFilter={smartFilter}
                  onSmartFilterChange={setSmartFilter}
                  onCreateFilter={() => setFilterModalOpen(true)}
                  quadrantFilter={quadrantFilter}
                  onQuadrantFilterChange={setQuadrantFilter}
                  taskCount={filteredVisible.length}
                />
              </div>

              {/* Grouping Mode Selector */}
              <div className="px-4 mb-4 flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Agrupar por:</span>
                <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
                  {(
                    [
                      { key: "workspace", label: "Workspace" },
                      { key: "cuadrante", label: "Cuadrante" },
                      { key: "proyecto", label: "Proyecto" },
                      { key: "lista", label: "Sin agrupar" },
                    ] as { key: GroupMode; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setGroupMode(opt.key)}
                      aria-pressed={groupMode === opt.key}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                        groupMode === opt.key
                          ? "bg-ink text-white"
                          : "text-ink-soft hover:bg-surface-muted hover:text-ink",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-auto px-4">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
              </div>
            ) : filteredVisible.length === 0 ? (
              quadrantFilter && visibleTasks.length > 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
                  <h2 className="text-base font-bold text-ink">
                    Sin tareas en {QUADRANTS[quadrantFilter]?.title ?? "este cuadrante"}
                  </h2>
                  <p className="max-w-sm text-sm text-ink-muted">
                    Tienes {visibleTasks.length} {visibleTasks.length === 1 ? "tarea" : "tareas"} pendientes en el
                    Inbox, ninguna en este cuadrante.
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuadrantFilter(null)}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    Ver todas
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pritio-green/10 text-pritio-green">
                    <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h2 className="text-base font-bold text-ink">Inbox vacío</h2>
                  <p className="max-w-sm text-sm text-ink-muted">
                    Captura algo abajo o con Cmd+K. Cada tarea vive aquí hasta que decidas su prioridad.
                  </p>
                </div>
              )
            ) : (
              <div className="space-y-2.5">
                {groups.map((group) => (
                  <section key={group.key}>
                    {renderGroupHeading(group)}
                    {!collapsedGroups.has(group.key) && (
                      <div className="space-y-2.5">
                        {group.tasks.map(renderTask)}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>
          </div>
          </div>
        </>
      )}

      {inboxViewMode === "plan" && (
        <div className="flex-1 overflow-auto px-4">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-ink">Plan Semanal</h2>
            <p className="text-sm text-ink-muted">Arrastra tareas entre días</p>
          </div>
          <PlanBoard tasks={filteredVisible} onTaskMove={handleTaskMoveToDate} />
        </div>
      )}

      {inboxViewMode === "kanban" && (
        <div className="flex-1 overflow-auto px-4">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-ink">Tablero Kanban</h2>
            <p className="text-sm text-ink-muted">Arrastra tareas entre columnas</p>
          </div>
          <KanbanBoard tasks={filteredVisible} onTaskMove={handleTaskMove} onTaskEdit={handleOpenEdit} />
        </div>
      )}

      <TaskFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTask(null);
        }}
        onSaved={(saved) => {
          setDialogOpen(false);
          setEditingTask(null);
          applyUpdate(saved);
        }}
        task={editingTask}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar tarea"
        description={`¿Eliminar "${deleteTarget?.title ?? ""}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />

      <FilterBuilderModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        onCreated={() => {}}
      />

      <BottomQuickAdd onQuickAdd={handleQuickAdd} />
    </div>
  );
}