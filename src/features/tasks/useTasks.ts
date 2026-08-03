import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask } from "@/lib/mappers";
import { useDebouncedRealtimeRefresh } from "@/lib/useDebouncedRealtimeRefresh";
import { deleteTask as apiDeleteTask } from "@/features/tasks/api";
import type { Task } from "@/types";

let channelKeyCounter = 0;

export function useTasks(workspaceId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!workspaceId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (taskError) throw taskError;

      const taskIds = (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((r) => r.id as string);

      const { data: assigneeRows } = await supabase
        .from("task_assignees")
        .select("task_id, assignee_id")
        .in("task_id", taskIds);

      const assigneeMap = new Map<string, string[]>();
      (assigneeRows ?? []).forEach((row: Record<string, unknown>) => {
        const taskId = row.task_id as string;
        const assigneeId = row.assignee_id as string;
        const ids = assigneeMap.get(taskId) ?? [];
        ids.push(assigneeId);
        assigneeMap.set(taskId, ids);
      });

      setTasks(
        (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
          mapTask(row as never, assigneeMap.get(row.id as string) ?? []),
        ),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const silentRefresh = useDebouncedRealtimeRefresh(fetchTasks);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!workspaceId) return;

    channelRef.current?.unsubscribe();

    channelKeyCounter++;
    const channel = supabase
      .channel(`tasks-${workspaceId}-${channelKeyCounter}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => silentRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_assignees" },
        () => silentRefresh(),
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [workspaceId, silentRefresh]);

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
  }, []);

  const updateTask = useCallback((task: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
  }, []);

  const removeTask = useCallback(async (taskId: string) => {
    try {
      await apiDeleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      // realtime will sync
    }
  }, []);

  return {
    tasks,
    isLoading,
    error,
    refresh: fetchTasks,
    addTask,
    updateTask,
    removeTask,
  };
}
