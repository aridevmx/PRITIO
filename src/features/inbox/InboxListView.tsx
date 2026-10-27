import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask, type SubtaskCounts } from "@/lib/mappers";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import { fetchSubtaskCounts } from "@/features/tasks/useTasks";
import { updateTask as apiUpdateTask, deleteTask as apiDeleteTask } from "@/features/tasks/api";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BottomQuickAdd } from "@/features/inbox/BottomQuickAdd";
import { emitAppEvent } from "@/lib/appEvents";
import { cn } from "@/lib/utils";
import { PRESET_COLORS } from "@/features/projects/presetColors";
import { listProjectsByWorkspaces } from "@/features/projects/api";
import { AppIcon } from "@/components/AppIcon";
import { CaretRight, Check, Star, Tag, Calendar, Clock, MagnifyingGlass } from "@phosphor-icons/react";
import type { Task, Quadrant, Project } from "@/types";

type GroupMode = "workspace" | "cuadrante" | "proyecto" | "lista";

interface TaskGroup {
  key: string;
  label: string;
  dotClass?: string;
  dotColor?: string;
  count: number;
  tasks: Task[];
}

export function InboxListView() {
  const { currentWorkspace, workspaces } = useWorkspace();
  const location = useLocation();
  const autoFocus = Boolean((location.state as { quickfocus?: boolean } | null)?.quickfocus);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [quadrantFilter, setQuadrantFilter] = useState<Quadrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("lista");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [showFilterPanel, setShowFilterPanel] = useState(false);

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
      setSelectedTasks((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
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

  const visibleTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

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

  const filteredVisible = useMemo(
    () => {
      let result = visibleTasks;
      if (quadrantFilter) {
        result = result.filter((t) => t.quadrant === quadrantFilter);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        result = result.filter((t) => t.title.toLowerCase().includes(q));
      }
      return result;
    },
    [visibleTasks, quadrantFilter, searchQuery],
  );

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

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const renderTask = (task: Task) => {
    const isSelected = selectedTasks.has(task.id);
    const quadrantMeta = QUADRANTS[task.quadrant];
    return (
      <div
        key={task.id}
        className={cn(
          "transition",
          pendingId === task.id && "opacity-60",
          isSelected && "bg-pritio-blue/5",
        )}
      >
        <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-muted transition-colors">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleTaskSelection(task.id)}
            className="h-4 w-4 rounded border-ink-muted text-pritio-blue focus:ring-pritio-blue"
            aria-label={`Seleccionar ${task.title}`}
          />
          <button
            type="button"
            onClick={() => handleToggleComplete(task)}
            className="shrink-0"
            aria-label={task.completed ? "Marcar como pendiente" : "Marcar como completada"}
          >
            <AppIcon glyph={task.completed ? Check : Star} className={cn("h-5 w-5", task.completed ? "text-pritio-green" : "text-ink-muted")} />
          </button>
          <div className="flex-1 min-w-0">
            <p className={cn("truncate text-sm font-medium", task.completed && "line-through text-ink-muted")}>
              {task.title}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-ink-muted">
              {task.workspaceId && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: workspaceColorMap[task.workspaceId] }} />
                  {workspaceNameMap[task.workspaceId]}
                </span>
              )}
              {quadrantMeta && (
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", quadrantMeta.classes.accentBg, quadrantMeta.classes.accentText)}>
                  {quadrantMeta.title}
                </span>
              )}
              {task.projectId && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-muted">
                  <AppIcon glyph={Tag} size="xs" />
                  {projects.find((p) => p.id === task.projectId)?.name}
                </span>
              )}
              {task.dueDate && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-muted">
                  <AppIcon glyph={Calendar} size="xs" />
                  {task.dueDate}
                </span>
              )}
              {task.startAt && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-muted">
                  <AppIcon glyph={Clock} size="xs" />
                  {task.startAt.slice(11, 16)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleOpenEdit(task)}
              className="p-1.5 rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
              aria-label="Editar tarea"
            >
              <AppIcon glyph={CaretRight} size="sm" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderGroupHeading = (group: TaskGroup) => {
    const collapsed = collapsedGroups.has(group.key);
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-surface/50 border-b border-line/50">
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
        <span className="ml-auto rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-muted">
          {group.count}
        </span>
      </div>
    );
  };

  const handleQuickAdd = useCallback(
    (title: string) => {
      emitAppEvent("pritio:create-task", { title });
    },
    [],
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-line bg-surface/50">
        <div className="flex-1">
          <label className="sr-only">Buscar tareas</label>
          <div className="relative">
            <AppIcon glyph={MagnifyingGlass} size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en Inbox…"
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-line bg-surface-subtle text-sm text-ink outline-none placeholder:text-ink-muted focus:border-pritio-blue focus:ring-1 focus:ring-pritio-blue/20"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
              showFilterPanel
                ? "border-pritio-blue bg-pritio-blue/10 text-pritio-blue"
                : "border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink",
            )}
          >
            <AppIcon glyph={Tag} size="sm" />
            Filtros
          </button>
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
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
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
      </div>

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className="p-4 border-b border-line bg-surface/50">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setQuadrantFilter(null)}
              aria-pressed={quadrantFilter === null}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                quadrantFilter === null
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink",
              )}
            >
              Todos
            </button>
            {QUADRANT_ORDER.flatMap((key) => {
              const meta = QUADRANTS[key];
              if (!meta) return [];
              const count = visibleTasks.filter((t) => t.quadrant === key).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQuadrantFilter(quadrantFilter === key ? null : key)}
                  aria-pressed={quadrantFilter === key}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    quadrantFilter === key
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-surface text-ink-soft hover:bg-surface-muted hover:text-ink",
                  )}
                >
                  {meta.title}
                  {count > 0 && (
                    <span
                      className={cn(
                        "ml-1 text-[10px] font-bold tabular-nums",
                        quadrantFilter === key ? "text-white/70" : "text-ink-muted",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-auto">
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
          <div className="divide-y divide-line">
            {groups.map((group) => (
              <section key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={!collapsedGroups.has(group.key)}
                  className="w-full"
                >
                  {renderGroupHeading(group)}
                </button>
                {!collapsedGroups.has(group.key) && (
                  <div className="divide-y divide-line/50">
                    {group.tasks.map(renderTask)}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

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

      <BottomQuickAdd onQuickAdd={handleQuickAdd} />
    </div>
  );
}