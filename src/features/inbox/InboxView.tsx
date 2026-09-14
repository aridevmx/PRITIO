import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask, type SubtaskCounts } from "@/lib/mappers";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import { fetchSubtaskCounts } from "@/features/tasks/useTasks";
import { updateTask as apiUpdateTask, deleteTask as apiDeleteTask } from "@/features/tasks/api";
import { listProjectsByWorkspaces } from "@/features/projects/api";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { emitAppEvent } from "@/lib/appEvents";
import { cn } from "@/lib/utils";
import type { Task, Project } from "@/types";

type GroupMode = "proyecto" | "cuadrante" | "lista";

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
  const location = useLocation();
  const autoFocus = Boolean((location.state as { quickfocus?: boolean } | null)?.quickfocus);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("proyecto");

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
    const wsIds = workspaces.map((w) => w.id);
    if (wsIds.length === 0) return;
    let cancelled = false;
    void listProjectsByWorkspaces(wsIds)
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaces]);

  useEffect(() => {
    if (autoFocus) emitAppEvent("pritio:create-task");
  }, [autoFocus]);

  // Nombres de responsables/creadores referenciados en las tareas.
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

  // Reacciona a cambios emitidos por formularios/creaciones para estar al día.
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
    const onProjectsChanged = () => {
      const wsIds = workspaces.map((w) => w.id);
      if (wsIds.length === 0) return;
      void listProjectsByWorkspaces(wsIds).then(setProjects).catch(() => {});
    };
    window.addEventListener("pritio:tasks-changed", onTasksChanged);
    window.addEventListener("pritio:app-refresh", onRefresh);
    window.addEventListener("pritio:synced", onRefresh);
    window.addEventListener("pritio:projects-changed", onProjectsChanged);
    return () => {
      window.removeEventListener("pritio:tasks-changed", onTasksChanged);
      window.removeEventListener("pritio:app-refresh", onRefresh);
      window.removeEventListener("pritio:synced", onRefresh);
      window.removeEventListener("pritio:projects-changed", onProjectsChanged);
    };
  }, [load, workspaces]);

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

  const visibleTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const groupsByProject = useMemo<TaskGroup[]>(() => {
    const groups = new Map<string, TaskGroup>();
    projects.forEach((p) => {
      groups.set(p.id, { key: p.id, label: p.name, dotColor: p.color, count: 0, tasks: [] });
    });
    let sinProjecto: TaskGroup | null = null;
    let otros: TaskGroup | null = null;
    for (const t of visibleTasks) {
      if (t.projectId && projectMap.has(t.projectId)) {
        const g = groups.get(t.projectId)!;
        g.count += 1;
        g.tasks.push(t);
      } else if (t.projectId) {
        otros ??= { key: "otros", label: "Otros", dotClass: "bg-ink-muted", count: 0, tasks: [] };
        otros.count += 1;
        otros.tasks.push(t);
      } else {
        sinProjecto ??= { key: "sin-proyecto", label: "Sin proyecto", dotClass: "bg-line-strong", count: 0, tasks: [] };
        sinProjecto.count += 1;
        sinProjecto.tasks.push(t);
      }
    }
    const result = [...groups.values()].filter((g) => g.count > 0);
    if (sinProjecto) result.push(sinProjecto);
    if (otros) result.push(otros);
    return result;
  }, [visibleTasks, projects, projectMap]);

  const groupsByQuadrant = useMemo<TaskGroup[]>(() => {
  return QUADRANT_ORDER.flatMap((key) => {
    const meta = QUADRANTS[key];
    if (!meta) return [];
    const matched = visibleTasks.filter((t) => t.quadrant === key);
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
}, [visibleTasks]);

  const groups: TaskGroup[] =
    groupMode === "proyecto"
      ? groupsByProject
      : groupMode === "cuadrante"
        ? groupsByQuadrant
        : [{ key: "lista", label: "Todas", count: visibleTasks.length, tasks: visibleTasks }];

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

  const renderGroupHeading = (group: TaskGroup) => (
    <div className="flex items-center gap-2 px-1 pt-5 pb-1.5 first:pt-2">
      <span
        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", group.dotClass)}
        style={group.dotColor ? { backgroundColor: group.dotColor } : undefined}
      />
      <h3 className="min-w-0 truncate text-sm font-bold text-ink">{group.label}</h3>
      <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-muted">
        {group.count}
      </span>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 lg:p-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-pritio-blue">Todas tus tareas</p>
        <h1 className="text-2xl font-extrabold text-ink">Captura y organiza</h1>
        <p className="text-sm text-ink-muted">
          Cada tarea creada vive aquí. Grupo por proyecto, cuadrante o como lista; edítala para darle fecha o prioridad.
        </p>
      </div>

      <div className="mt-6 mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          {visibleTasks.length} tareas pendientes
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          {(
            [
              { key: "proyecto", label: "Proyecto" },
              { key: "cuadrante", label: "Cuadrante" },
              { key: "lista", label: "Lista" },
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

      <div className="mt-2">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
          </div>
        ) : visibleTasks.length === 0 ? (
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
        ) : (
          <div className="space-y-2.5">
            {groups.map((group) => (
              <section key={group.key}>
                {renderGroupHeading(group)}
                <div className="space-y-2.5">
                  {group.tasks.map(renderTask)}
                </div>
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
    </div>
  );
}