import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask } from "@/lib/mappers";
import type { SubtaskCounts } from "@/lib/mappers";
import { useDebouncedRealtimeRefresh } from "@/lib/useDebouncedRealtimeRefresh";
import { isOnline, loadSnapshot, saveSnapshot } from "@/lib/offline";
import { deleteTask as apiDeleteTask } from "@/features/tasks/api";
import type { Task } from "@/types";

let channelKeyCounter = 0;

/** Conteos de subtareas por task_id para los workspaces dados. */
export async function fetchSubtaskCounts(
  workspaceIds: string[],
): Promise<Map<string, SubtaskCounts>> {
  const counts = new Map<string, SubtaskCounts>();
  if (workspaceIds.length === 0) return counts;
  const { data } = await supabase
    .from("task_subtasks")
    .select("task_id, completed")
    .in("workspace_id", workspaceIds);
  (data ?? []).forEach((row: Record<string, unknown>) => {
    const taskId = row.task_id as string;
    const cur = counts.get(taskId) ?? { total: 0, completed: 0 };
    cur.total += 1;
    if (row.completed) cur.completed += 1;
    counts.set(taskId, cur);
  });
  return counts;
}

export function useTasks(workspaceId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadFromSnapshot = useCallback(async () => {
    if (!workspaceId) return false;
    const snap = await loadSnapshot<Task[]>(`tasks:${workspaceId}`);
    if (snap) {
      setTasks(snap.data);
      setError(null);
      return true;
    }
    return false;
  }, [workspaceId]);

  const fetchTasks = useCallback(async () => {
    if (!workspaceId) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Si ya estamos offline, servir snapshot inmediatamente sin colgar la UI.
    if (!isOnline()) {
      const ok = await loadFromSnapshot();
      setIsLoading(false);
      if (!ok) setError(new Error("Sin conexión"));
      return;
    }

    try {
      // Timeout de seguridad: si la red está caída pero navigator.onLine miente,
      // la promesa no se queda colgada indefinidamente.
      const { data: taskRows, error: taskError } = await Promise.race([
        supabase
          .from("tasks")
          .select(TASK_COLUMNS)
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false }),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("La solicitud tardó demasiado")), 10_000),
        ),
      ]);

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

      let subtaskCounts: Map<string, SubtaskCounts> | undefined;
      try {
        subtaskCounts = await fetchSubtaskCounts([workspaceId]);
      } catch {
        // Los conteos son cosméticos; no deben romper la carga de tareas.
      }

      const mapped = (taskRows as unknown as Record<string, unknown>[] | null ?? []).map((row) =>
        mapTask(
          row as never,
          assigneeMap.get(row.id as string) ?? [],
          subtaskCounts?.get(row.id as string),
        ),
      );
      setTasks(mapped);
      setError(null);
      void saveSnapshot(`tasks:${workspaceId}`, mapped);
    } catch (err) {
      // Sin conexión: servir el último snapshot en lugar de quedarse vacío.
      const ok = await loadFromSnapshot();
      if (!ok) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, loadFromSnapshot]);

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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_subtasks",
          filter: `workspace_id=eq.${workspaceId}`,
        },
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
