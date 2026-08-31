import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { QUADRANTS, QUADRANT_ORDER, type QuadrantIconKey } from "@/features/tasks/quadrants";
import { TASK_COLUMNS, mapTask } from "@/lib/mappers";
import type { SubtaskCounts } from "@/lib/mappers";
import { cn, todayStr, localDateStr } from "@/lib/utils";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { useTasks, fetchSubtaskCounts } from "@/features/tasks/useTasks";
import { QuadrantsDnd } from "@/features/tasks/QuadrantsDnd";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { ManageDialog } from "@/components/layout/ManageDialog";
import { SegmentedControl } from "@/components/SegmentedControl";
import { updateTask as apiUpdateTask, archiveTask as apiArchiveTask } from "@/features/tasks/api";
import { notifyTaskChange } from "@/features/tasks/notifications";
import { isOnline, queueOfflineOp } from "@/lib/offline";
import { groupTasksByDay, formatDateShort } from "@/features/tasks/dates";
import type { Task, Quadrant } from "@/types";

interface QuadrantsViewProps {
  workspaceIds?: string[];
  refreshKey?: number;
  variant?: "grid" | "kanban";
}

const QUADRANT_ICONS: Record<QuadrantIconKey, ReactNode> = {
  zap: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M9 1.5L3.5 9H8L7 14.5L12.5 7H8L9 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 13c.5-2.2 2-3.2 3.5-3.2s3 1 3.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11.2" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 13c.4-1.7 1.4-2.5 2.5-2.5 1 0 1.8.6 2.2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  archive: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 8h3L7 10h2l1.5-2h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 4.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

function addDaysStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDateStr(d);
}

function QuadrantColumn({
  quadrantKey,
  tasks,
  onToggleComplete,
  onEdit,
  onDelete,
  onAddTask,
  profileNameMap,
  workspaceNameMap,
  variant = "grid",
}: {
  quadrantKey: Quadrant;
  tasks: Task[];
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAddTask: (quadrant: Quadrant) => void;
  profileNameMap: Record<string, string>;
  workspaceNameMap: Record<string, string>;
  variant?: "grid" | "kanban";
}) {
  const { setNodeRef, isOver } = useDroppable({ id: quadrantKey });
  const meta = QUADRANTS[quadrantKey];
  const count = tasks.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-2xl border bg-surface p-4 transition-all",
        variant === "kanban"
          ? "h-full w-[85vw] shrink-0 snap-center sm:w-[70vw] lg:w-auto lg:min-w-0 lg:flex-1"
          : "min-w-0",
        meta.classes.border,
        meta.classes.glow,
        isOver && meta.classes.dropOver,
      )}
    >
      <div className="mb-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", meta.classes.badge)}>
            {QUADRANT_ICONS[meta.iconKey]}
          </div>
          <h3 className="text-base font-extrabold text-ink">{meta.title}</h3>
          <span
            className={cn(
              "ml-auto inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold",
              meta.classes.badge,
            )}
          >
            {count}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] font-medium text-ink-muted">{meta.subtitle}</p>
      </div>

      <div
        className={cn(
          "flex-1 space-y-2",
          variant === "kanban" && "min-h-0 overflow-y-auto pr-0.5",
        )}
      >
        {count === 0 ? (
          <button
            type="button"
            onClick={() => onAddTask(quadrantKey)}
            className={cn(
              "flex w-full flex-col items-center gap-2.5 rounded-xl border border-dashed py-6 transition-all",
              meta.classes.borderStrong,
              meta.classes.softBg,
              "hover:bg-surface-muted",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border",
                meta.classes.borderStrong,
                meta.classes.accentText,
              )}
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className={cn("text-sm font-semibold", meta.classes.accentText)}>
              Agregar primera tarea
            </span>
            <span className="text-xs text-ink-muted">Toca para crear tu primera tarea</span>
          </button>
        ) : (
          <>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggleComplete={onToggleComplete}
                onEdit={onEdit}
                onDelete={onDelete}
                responsableName={task.responsibleAssigneeId ? profileNameMap[task.responsibleAssigneeId] : undefined}
                creatorName={profileNameMap[task.createdBy]}
                workspaceName={workspaceNameMap[task.workspaceId]}
              />
            ))}
          </>
        )}
      </div>

      {count > 0 && (
        <button
          type="button"
          onClick={() => onAddTask(quadrantKey)}
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2 text-xs font-semibold transition-colors",
            meta.classes.borderStrong,
            meta.classes.accentText,
            "hover:bg-surface-muted",
          )}
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Agregar tarea
        </button>
      )}
    </div>
  );
}

function CompletedSection({
  tasks,
  onToggleComplete,
  onEdit,
  onDelete,
  onArchive,
  profileNameMap,
  workspaceNameMap,
  className,
}: {
  tasks: Task[];
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onArchive: (task: Task) => void;
  profileNameMap: Record<string, string>;
  workspaceNameMap: Record<string, string>;
  className?: string;
}) {
  const [open, setOpen] = useState(true);

  if (tasks.length === 0) return null;

  return (
    <div className={cn("border-t border-line pt-4", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="group mb-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-muted/60"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-pritio-green/10 text-pritio-green">
          <svg
            className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-90")}
            viewBox="0 0 12 12"
            fill="none"
          >
            <path d="M4.5 2L9 6L4.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="text-sm font-bold text-ink-muted group-hover:text-ink">Completadas</h2>
        <span className="ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-muted px-1.5 text-[10px] font-bold tabular-nums text-ink-muted">
          {tasks.length}
        </span>
        <div className="h-px flex-1 bg-line/50" />
      </button>

      {open && (
        <div className="space-y-3">
          {[...groupTasksByDay(tasks).entries()].map(([dateKey, dayTasks]) => (
            <div key={dateKey}>
              <p className="mb-1.5 pl-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                {formatDateShort(dateKey)}
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {dayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggleComplete={onToggleComplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onArchive={onArchive}
                    responsableName={task.responsibleAssigneeId ? profileNameMap[task.responsibleAssigneeId] : undefined}
                    creatorName={profileNameMap[task.createdBy]}
                    workspaceName={task.workspaceId ? workspaceNameMap[task.workspaceId] : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type DueFilter = "overdue" | "today" | "week" | "month" | "none" | "";

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "", label: "Cualquier fecha" },
  { value: "overdue", label: "Vencidas" },
  { value: "today", label: "Hoy" },
  { value: "week", label: "Próximos 7 días" },
  { value: "month", label: "Este mes" },
  { value: "none", label: "Sin fecha" },
];

export function QuadrantsView({ workspaceIds, refreshKey, variant = "grid" }: QuadrantsViewProps) {
  const { currentWorkspace, workspaces } = useWorkspace();
  const singleId = workspaceIds ? null : currentWorkspace?.id ?? null;
  const { tasks, isLoading, updateTask: updateLocalTask, removeTask, refresh: refreshTasks } = useTasks(
    singleId,
    { workspaceType: currentWorkspace?.type },
  );

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  const isMultiWs = !!workspaceIds;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultQuadrant, setDefaultQuadrant] = useState<Quadrant>("do");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});
  const profileCacheRef = useRef<Record<string, string>>({});

  const workspaceNameMap = useMemo(() => {
    if (!workspaceIds) return {};
    const map: Record<string, string> = {};
    workspaces.forEach((w) => {
      map[w.id] =
        w.type === "personal"
          ? "Personal"
          : w.type === "family"
            ? w.name
            : `Equipo: ${w.name}`;
    });
    if (currentWorkspace)
      map[currentWorkspace.id] =
        currentWorkspace.type === "personal"
          ? "Personal"
          : currentWorkspace.type === "family"
            ? currentWorkspace.name
            : `Equipo: ${currentWorkspace.name}`;
    return map;
  }, [workspaces, currentWorkspace, workspaceIds]);

  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [dueFilter, setDueFilter] = useState<DueFilter>("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const [selectedQuadrant, setSelectedQuadrant] = useState<Quadrant>("do");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [manageSheetOpen, setManageSheetOpen] = useState(false);

  useEffect(() => {
    const wsIds =
      workspaceIds && workspaceIds.length > 0
        ? workspaceIds
        : currentWorkspace?.id
          ? [currentWorkspace.id]
          : [];
    if (wsIds.length === 0) return;
    supabase
      .from("assignees")
      .select("id, name")
      .in("workspace_id", wsIds)
      .then(({ data }) => setAssignees(data ?? []));
    supabase
      .from("projects")
      .select("id, name")
      .in("workspace_id", wsIds)
      .then(({ data }) => setProjects(data ?? []));
  }, [currentWorkspace?.id, workspaceIds]);

  const tasksSource = isMultiWs ? allTasks : tasks;

  /* Build profile name map from all referenced user IDs */
  useEffect(() => {
    const userIds = new Set<string>();
    tasksSource.forEach((t) => {
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
  }, [tasksSource]);

  const refreshAllTasks = useCallback(async (wsIds: string[]) => {
    setAllLoading(true);
    const { data: taskRows } = await supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .in("workspace_id", wsIds)
      .order("created_at", { ascending: false });
    const taskIds = (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((r) => r.id as string);
    const { data: assigneeRows } = await supabase
      .from("task_assignees")
      .select("task_id, assignee_id")
      .in("task_id", taskIds);
    const assigneeMap = new Map<string, string[]>();
    (assigneeRows ?? []).forEach((row: Record<string, unknown>) => {
      const tId = row.task_id as string;
      const aId = row.assignee_id as string;
      const ids = assigneeMap.get(tId) ?? [];
      ids.push(aId);
      assigneeMap.set(tId, ids);
    });
    let subtaskCounts: Map<string, SubtaskCounts> | undefined;
    try {
      subtaskCounts = await fetchSubtaskCounts(wsIds);
    } catch {
      // Los conteos son cosméticos.
    }
    setAllTasks(
      (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
        mapTask(
          row as never,
          assigneeMap.get(row.id as string) ?? [],
          subtaskCounts?.get(row.id as string),
        ),
      ),
    );
    setAllLoading(false);
  }, []);

  useEffect(() => {
    if (refreshKey === undefined) return;
    if (isMultiWs && workspaceIds) {
      refreshAllTasks(workspaceIds);
    } else {
      refreshTasks();
    }
  }, [refreshKey, isMultiWs, workspaceIds, refreshAllTasks, refreshTasks]);

  useEffect(() => {
    if (!workspaceIds || workspaceIds.length === 0) return;
    setAllLoading(true);
    (async () => {
      const { data: taskRows } = await supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .in("workspace_id", workspaceIds)
        .order("created_at", { ascending: false });
      const taskIds = (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((r) => r.id as string);
      const { data: assigneeRows } = await supabase
        .from("task_assignees")
        .select("task_id, assignee_id")
        .in("task_id", taskIds);
      const assigneeMap = new Map<string, string[]>();
      (assigneeRows ?? []).forEach((row: Record<string, unknown>) => {
        const tId = row.task_id as string;
        const aId = row.assignee_id as string;
        const ids = assigneeMap.get(tId) ?? [];
        ids.push(aId);
        assigneeMap.set(tId, ids);
      });
      let subtaskCounts: Map<string, SubtaskCounts> | undefined;
      try {
        subtaskCounts = await fetchSubtaskCounts(workspaceIds);
      } catch {
        // Los conteos son cosméticos.
      }
      setAllTasks(
        (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
          mapTask(
            row as never,
            assigneeMap.get(row.id as string) ?? [],
            subtaskCounts?.get(row.id as string),
          ),
        ),
      );
      setAllLoading(false);
    })();
  }, [workspaceIds]);

  const handleAddTask = useCallback((quadrant: Quadrant) => {
    setEditingTask(null);
    setDefaultQuadrant(quadrant);
    setDialogOpen(true);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setDefaultQuadrant(task.quadrant);
    setDialogOpen(true);
  }, []);

  const handleToggleComplete = useCallback(
    async (task: Task) => {
      // Sin conexión: encola el toggle y aplica el estado localmente;
      // el outbox lo sincroniza al reconectar.
      if (!isOnline() && currentWorkspace) {
        const nextCompleted = !task.completed;
        const completedAt = nextCompleted ? new Date().toISOString() : null;
        void queueOfflineOp(
          "task_update",
          currentWorkspace.id,
          task.id,
          { completed: nextCompleted, completed_at: completedAt },
        );
        const optimistic: Task = { ...task, completed: nextCompleted, completedAt };
        if (isMultiWs) {
          setAllTasks((prev) => prev.map((t) => (t.id === task.id ? optimistic : t)));
        } else {
          updateLocalTask(optimistic);
        }
        return;
      }
      try {
        const updated = await apiUpdateTask(task.id, { completed: !task.completed });
        if (isMultiWs) {
          setAllTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        } else {
          updateLocalTask(updated);
        }
        if (!task.completed && task.assigneeIds.length > 0 && currentWorkspace) {
          void notifyTaskChange("completed", task.id, currentWorkspace.id, task.assigneeIds);
        }
      } catch {
        // realtime will sync
      }
    },
    [updateLocalTask, isMultiWs, currentWorkspace],
  );

  const handleArchive = useCallback(
    async (task: Task) => {
      try {
        await apiArchiveTask(task.id);
        if (isMultiWs) {
          setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
        } else {
          removeTask(task.id);
        }
      } catch {
        // realtime will sync
      }
    },
    [removeTask, isMultiWs],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      try {
        await removeTask(task.id);
        if (isMultiWs) {
          setAllTasks((prev) => prev.filter((t) => t.id !== task.id));
        }
      } catch {
        // realtime will sync
      }
      setDeleteTarget(null);
    },
    [removeTask, isMultiWs],
  );

  const handleMoveTask = useCallback(
    async (taskId: string, newQuadrant: Quadrant) => {
      try {
        const updated = await apiUpdateTask(taskId, { quadrant: newQuadrant });
        if (isMultiWs) {
          setAllTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
        } else {
          updateLocalTask(updated);
        }
      } catch {
        // realtime will sync
      }
    },
    [updateLocalTask, isMultiWs],
  );

  const handleSaved = useCallback(
    (task: Task) => {
      if (isMultiWs) {
        setAllTasks((prev) => {
          const idx = prev.findIndex((t) => t.id === task.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = task;
            return next;
          }
          return [task, ...prev];
        });
      } else {
        updateLocalTask(task);
      }
    },
    [updateLocalTask, isMultiWs],
  );

  const loading = isMultiWs ? allLoading : isLoading;

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayStr();
    const weekEnd = addDaysStr(7);
    const now = new Date();
    const monthStart = today.slice(0, 7) + "-01";
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    ).padStart(2, "0")}`;
    return tasksSource.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (projectFilter && t.projectId !== projectFilter) return false;
      if (assigneeFilter && !t.assigneeIds.includes(assigneeFilter)) return false;
      if (dueFilter === "overdue" && !(t.dueDate && t.dueDate < today)) return false;
      if (dueFilter === "today" && t.dueDate !== today) return false;
      if (dueFilter === "week" && !(t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd)) return false;
      if (dueFilter === "month" && !(t.dueDate && t.dueDate >= monthStart && t.dueDate <= monthEnd)) return false;
      if (dueFilter === "none" && t.dueDate) return false;
      return true;
    });
  }, [tasksSource, search, projectFilter, dueFilter, assigneeFilter]);

  const hasActiveFilters =
    search.trim() !== "" || projectFilter !== "" || dueFilter !== "" || assigneeFilter !== "";

  const clearFilters = () => {
    setSearch("");
    setProjectFilter("");
    setDueFilter("");
    setAssigneeFilter("");
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
      </div>
    );
  }

  const activeTasks = filteredTasks.filter((t) => !t.completed);
  const completedTasks = filteredTasks.filter((t) => t.completed);

  const selectClass =
    "rounded-xl border border-line bg-surface px-2.5 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20";

  const selectedTasks = activeTasks.filter((t) => t.quadrant === selectedQuadrant);
  const selectedCompleted = completedTasks.filter((t) => t.quadrant === selectedQuadrant);
  const activeFilterCount = [projectFilter, dueFilter, assigneeFilter].filter(Boolean).length;

  return (
    <>
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col p-4 lg:p-6",
          variant === "kanban" ? "max-w-7xl" : "max-w-6xl",
        )}
        data-tour="cuadrantes"
      >
        <div className="flex flex-1 flex-col gap-4">
          {/* Filters (desktop inline for grid, always for kanban) — una sola línea */}
          <div className={cn("flex items-center gap-2 overflow-x-auto pb-0.5", variant === "grid" && "hidden lg:flex")}>
            <div className="relative min-w-[180px] flex-1 shrink-0">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tareas..."
              className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
            />
            </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={cn(selectClass, "shrink-0")}
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <SegmentedControl
            value={dueFilter === "overdue" || dueFilter === "none" ? "" : dueFilter}
            onChange={(v) => setDueFilter(v as DueFilter)}
            options={[
              { value: "" as DueFilter, label: "Todas" },
              { value: "today" as DueFilter, label: "Hoy" },
              { value: "week" as DueFilter, label: "Semana" },
              { value: "month" as DueFilter, label: "Mes" },
            ]}
            size="sm"
            pill
            className="shrink-0"
          />
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className={cn(selectClass, "shrink-0")}
          >
            <option value="">Cualquier asignado</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-pritio-blue hover:bg-pritio-blue/5 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Mobile controls (grid only, < lg) */}
        {variant === "grid" && (
          <div className="flex flex-col gap-3 lg:hidden">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                viewBox="0 0 16 16"
                fill="none"
              >
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tareas..."
                className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFilterSheetOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
              >
                <svg className="h-4 w-4 text-ink-muted" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4.5h12M4 8h8M6.5 11.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Filtros
                {activeFilterCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-pritio-blue px-1 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setManageSheetOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted"
              >
                <svg className="h-4 w-4 text-ink-muted" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4L4.5 4.5M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Gestionar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {QUADRANT_ORDER.map((qKey) => {
                const meta = QUADRANTS[qKey];
                const count = activeTasks.filter((t) => t.quadrant === qKey).length;
                const selected = selectedQuadrant === qKey;
                return (
                  <button
                    key={qKey}
                    type="button"
                    onClick={() => setSelectedQuadrant(qKey)}
                    aria-pressed={selected}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",
                      meta.classes.border,
                      selected ? "bg-surface" : "border-line bg-surface/50 opacity-70",
                      selected && meta.classes.glow,
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        meta.classes.badge,
                      )}
                    >
                      {QUADRANT_ICONS[meta.iconKey]}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-xs font-bold leading-tight",
                        selected ? "text-ink" : "text-ink-muted",
                      )}
                    >
                      {meta.title}
                    </span>
                    <span className={cn("shrink-0 text-xs font-bold tabular-nums", meta.classes.accentText)}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {variant === "kanban" ? (
        <QuadrantsDnd
          tasks={activeTasks}
          onMoveTask={handleMoveTask}
          onToggleComplete={handleToggleComplete}
          onEdit={handleEditTask}
        >
          <div className="-mx-4 flex min-h-[400px] flex-1 items-stretch gap-4 overflow-x-auto px-4 pb-2 snap-x snap-mandatory lg:mx-0 lg:overflow-visible lg:px-0">
            {QUADRANT_ORDER.map((qKey) => {
              const quadrantTasks = activeTasks.filter((t) => t.quadrant === qKey);
              return (
                <QuadrantColumn
                  key={qKey}
                  quadrantKey={qKey}
                  tasks={quadrantTasks}
                  onToggleComplete={handleToggleComplete}
                  onEdit={handleEditTask}
                  onDelete={setDeleteTarget}
                  onAddTask={handleAddTask}
                  profileNameMap={profileNameMap}
                  workspaceNameMap={workspaceNameMap}
                  variant="kanban"
                />
              );
            })}
          </div>
        </QuadrantsDnd>
      ) : (
        <>
          {/* Desktop 2x2 grid */}
          <div className="hidden lg:block">
            <QuadrantsDnd
              tasks={activeTasks}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEdit={handleEditTask}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {QUADRANT_ORDER.map((qKey) => {
                  const quadrantTasks = activeTasks.filter((t) => t.quadrant === qKey);
                  return (
                    <QuadrantColumn
                      key={qKey}
                      quadrantKey={qKey}
                      tasks={quadrantTasks}
                      onToggleComplete={handleToggleComplete}
                      onEdit={handleEditTask}
                      onDelete={setDeleteTarget}
                      onAddTask={handleAddTask}
                      profileNameMap={profileNameMap}
                      workspaceNameMap={workspaceNameMap}
                    />
                  );
                })}
              </div>
            </QuadrantsDnd>
          </div>
          {/* Mobile single quadrant */}
          <div className="lg:hidden">
            <QuadrantsDnd
              tasks={activeTasks}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEdit={handleEditTask}
            >
              <QuadrantColumn
                key={selectedQuadrant}
                quadrantKey={selectedQuadrant}
                tasks={selectedTasks}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditTask}
                onDelete={setDeleteTarget}
                onAddTask={handleAddTask}
                profileNameMap={profileNameMap}
                workspaceNameMap={workspaceNameMap}
              />
            </QuadrantsDnd>
          </div>
        </>
      )}

          {/* Completed tasks (grid only) */}
          {variant === "grid" && (
            <>
              <CompletedSection
                className="hidden lg:block"
                tasks={completedTasks}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditTask}
                onDelete={setDeleteTarget}
                onArchive={handleArchive}
                profileNameMap={profileNameMap}
                workspaceNameMap={workspaceNameMap}
              />
              <CompletedSection
                className="lg:hidden"
                tasks={selectedCompleted}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditTask}
                onDelete={setDeleteTarget}
                onArchive={handleArchive}
                profileNameMap={profileNameMap}
                workspaceNameMap={workspaceNameMap}
              />
            </>
          )}

          </div>
        </div>

      <TaskFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTask(null);
        }}
        onSaved={handleSaved}
        task={editingTask}
        defaultQuadrant={defaultQuadrant}
      />

      <BottomSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Filtros">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Proyecto</label>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className={cn(selectClass, "w-full")}
            >
              <option value="">Todos los proyectos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Fecha</label>
            <select
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value as DueFilter)}
              className={cn(selectClass, "w-full")}
            >
              {DUE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink-muted">Asignado a</label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className={cn(selectClass, "w-full")}
            >
              <option value="">Cualquier asignado</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="w-full rounded-xl border border-line py-2.5 text-sm font-semibold text-pritio-coral transition-colors hover:bg-pritio-coral/5"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={manageSheetOpen} onClose={() => setManageSheetOpen(false)} title="Gestionar">
        {currentWorkspace && (
          <ManageDialog workspaceId={currentWorkspace.id} workspaceName={currentWorkspace.name} />
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar tarea"
        description={`¿Eliminar "${deleteTarget?.title ?? ""}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </>
  );
}
