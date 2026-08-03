import { useState, useCallback, useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useTasks } from "@/features/tasks/useTasks";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import { TASK_COLUMNS, mapTask } from "@/lib/mappers";
import { cn } from "@/lib/utils";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { QuadrantsDnd } from "@/features/tasks/QuadrantsDnd";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { updateTask as apiUpdateTask, archiveTask as apiArchiveTask } from "@/features/tasks/api";
import { groupTasksByDay, formatDateShort } from "@/features/tasks/dates";
import type { Task, Quadrant } from "@/types";



interface QuadrantsViewProps {
  workspaceIds?: string[];
  refreshKey?: number;
}

function QuadrantColumn({
  quadrantKey,
  tasks,
  onToggleComplete,
  onEdit,
  onDelete,
  onAddTask,
  profileNameMap,
}: {
  quadrantKey: Quadrant;
  tasks: Task[];
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onAddTask: (quadrant: Quadrant) => void;
  profileNameMap: Record<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: quadrantKey });
  const meta = QUADRANTS[quadrantKey];
  const count = tasks.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-2xl border bg-surface p-4 shadow-soft transition-all",
        meta.classes.border,
        isOver && meta.classes.dropOver,
      )}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-dashed border-line pb-3">
        <div className={cn("h-3.5 w-3.5 rounded", meta.classes.accentBg)} />
        <h3 className={cn("text-base font-extrabold", meta.classes.accentText)}>
          {meta.title}
        </h3>
        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-bold text-ink-muted">
          {count}
        </span>
      </div>

      <div className="flex-1 space-y-2">
        {count === 0 ? (
          <button
            type="button"
            onClick={() => onAddTask(quadrantKey)}
            className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line py-10 transition-colors hover:bg-surface-muted hover:border-ink-muted/30"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink-muted/30 text-ink-muted">
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-ink-soft">{meta.title}</span>
            <span className="text-xs text-ink-muted">Toca para agregar tu primera tarea</span>
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
              />
            ))}
          </>
        )}
      </div>

      {count > 0 && (
        <button
          type="button"
          onClick={() => onAddTask(quadrantKey)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line py-2.5 text-xs font-medium text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
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

export function QuadrantsView({ workspaceIds, refreshKey }: QuadrantsViewProps) {
  const { currentWorkspace } = useWorkspace();
  const singleId = workspaceIds ? null : currentWorkspace?.id ?? null;
  const { tasks, isLoading, updateTask: updateLocalTask, removeTask, refresh: refreshTasks } = useTasks(singleId);

  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allLoading, setAllLoading] = useState(false);

  const isMultiWs = !!workspaceIds;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [defaultQuadrant, setDefaultQuadrant] = useState<Quadrant>("do");
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const [profileNameMap, setProfileNameMap] = useState<Record<string, string>>({});
  const profileCacheRef = useRef<Record<string, string>>({});

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
    setAllTasks(
      (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
        mapTask(row as never, assigneeMap.get(row.id as string) ?? []),
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
      setAllTasks(
        (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
          mapTask(row as never, assigneeMap.get(row.id as string) ?? []),
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
      try {
        const updated = await apiUpdateTask(task.id, { completed: !task.completed });
        if (isMultiWs) {
          setAllTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
        } else {
          updateLocalTask(updated);
        }
      } catch {
        // realtime will sync
      }
    },
    [updateLocalTask, isMultiWs],
  );

  const [completedOpen, setCompletedOpen] = useState(true);

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

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-prio-blue" />
      </div>
    );
  }

  const activeTasks = tasksSource.filter((t) => !t.completed);
  const completedTasks = tasksSource.filter((t) => t.completed);

  return (
    <>
      <QuadrantsDnd
        tasks={activeTasks}
        onMoveTask={handleMoveTask}
        onToggleComplete={handleToggleComplete}
        onEdit={handleEditTask}
      >
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:p-6">
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
              />
            );
          })}
        </div>
      </QuadrantsDnd>

      {/* Completed tasks section */}
      {completedTasks.length > 0 && (
        <div className="px-4 pb-6 lg:px-6">
          <button
            onClick={() => setCompletedOpen((o) => !o)}
            className="mb-3 flex w-full items-center gap-2 text-left"
          >
            <svg
              className={cn("h-4 w-4 text-ink-muted transition-transform", completedOpen && "rotate-90")}
              viewBox="0 0 16 16"
              fill="none"
            >
              <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h2 className="text-sm font-bold text-ink-muted uppercase tracking-wider">
              Completadas
            </h2>
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs text-ink-muted">{completedTasks.length}</span>
          </button>

          {completedOpen && (
            <div className="space-y-4">
              {[...groupTasksByDay(completedTasks).entries()].map(([dateKey, dayTasks]) => (
                <div key={dateKey}>
                  <p className="mb-2 text-xs font-semibold text-ink-soft uppercase tracking-wider">
                    {formatDateShort(dateKey)}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {dayTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onToggleComplete={handleToggleComplete}
                        onEdit={handleEditTask}
                        onDelete={setDeleteTarget}
                        onArchive={handleArchive}
                        responsableName={task.responsibleAssigneeId ? profileNameMap[task.responsibleAssigneeId] : undefined}
                        creatorName={profileNameMap[task.createdBy]}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

