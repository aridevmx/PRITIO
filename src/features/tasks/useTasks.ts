import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import { TASK_COLUMNS, mapTask } from "@/lib/mappers";
import type { SubtaskCounts } from "@/lib/mappers";
import { useDebouncedRealtimeRefresh } from "@/lib/useDebouncedRealtimeRefresh";
import { onAppEvent } from "@/lib/appEvents";
import { isOnline, loadSnapshot, saveSnapshot } from "@/lib/offline";
import { deleteTask as apiDeleteTask } from "@/features/tasks/api";
import { allowedKindsForWorkspace } from "@/features/tasks/kinds";
import type { Task, WorkspaceType } from "@/types";

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

/**
 * Evento que emiten las vistas/el formulario al crear o actualizar una tarea
 * para que la lista local reaccione al instante (sin esperar al Realtime).
 */
export const TASKS_CHANGED_EVENT = "pritio:tasks-changed";

export interface TasksChangedDetail {
  task: Task;
  workspaceId: string;
}

export function useTasks(
  workspaceId: string | null,
  options?: {
    workspaceType?: WorkspaceType | string;
    /** Filtra por estado de Inbox (captura pendiente de triaje). */
    inboxed?: boolean;
    /** Modo multi-workspace: se usa cuando `workspaceId` es null y se
        agregan tareas de varios workspaces del mismo tipo. */
    workspaceIds?: string[];
  },
) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const kinds = useMemo(
    () => allowedKindsForWorkspace(options?.workspaceType),
    [options?.workspaceType],
  );
  const { inboxed } = options ?? {};
  const multiIds = useMemo(() => options?.workspaceIds ?? [], [options?.workspaceIds]);

  const loadFromSnapshot = useCallback(async () => {
    if (!workspaceId) return false;
    const snap = await loadSnapshot<Task[]>(`tasks:${workspaceId}`);
    if (snap) {
      const filtered = (kinds ? snap.data.filter((t) => kinds.includes(t.kind)) : snap.data).filter((t) =>
        inboxed === undefined ? true : t.inboxed === inboxed,
      );
      setTasks(filtered);
      setError(null);
      return true;
    }
    return false;
  }, [workspaceId, kinds, inboxed]);

  const fetchTasks = useCallback(async () => {
    if (!workspaceId) {
      if (multiIds.length === 0) {
        setTasks([]);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);

    // Si ya estamos offline y es un solo workspace, servir snapshot inmediatamente sin colgar la UI.
    if (workspaceId && !isOnline()) {
      const ok = await loadFromSnapshot();
      setIsLoading(false);
      if (!ok) setError(new Error("Sin conexión"));
      return;
    }

    try {
      // Timeout de seguridad: si la red está caída pero navigator.onLine miente,
      // la promesa no se queda colgada indefinidamente.
      let query = workspaceId
        ? supabase.from("tasks").select(TASK_COLUMNS).eq("workspace_id", workspaceId)
        : supabase.from("tasks").select(TASK_COLUMNS).in("workspace_id", multiIds);
      if (kinds && kinds.length > 0) query = query.in("kind", kinds);
      if (inboxed !== undefined) query = query.eq("inboxed", inboxed);

      const { data: taskRows, error: taskError } = await Promise.race([
        query.order("created_at", { ascending: false }),
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
        subtaskCounts = await fetchSubtaskCounts(workspaceId ? [workspaceId] : multiIds);
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
      if (workspaceId) void saveSnapshot(`tasks:${workspaceId}`, mapped);
    } catch (err) {
      // Sin conexión: servir el último snapshot en lugar de quedarse vacío (solo un workspace).
      if (workspaceId) {
        const ok = await loadFromSnapshot();
        if (!ok) setError(err instanceof Error ? err : new Error(String(err)));
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, multiIds, kinds, loadFromSnapshot, inboxed]);

  const silentRefresh = useDebouncedRealtimeRefresh(fetchTasks);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  // Las vistas emiten este evento al guardar desde el formulario (crear o
  // editar). Actualiza el estado local al instante y luego refresca desde el
  // servidor para traer también subtareas/asignaciones enlazadas.
  useEffect(() => {
    const onTasksChanged = (event: Event) => {
      const detail = (event as CustomEvent<TasksChangedDetail>).detail;
      if (!detail) return;
      if (detail.workspaceId && workspaceId && detail.workspaceId !== workspaceId) {
        return;
      }
      const task = detail.task;
      if (!task) return;

      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = task;
          return next;
        }
        return [task, ...prev];
      });
      silentRefresh();
    };
    window.addEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
  }, [workspaceId, silentRefresh]);

  // Al terminar de sincronizar el outbox, refrescar desde el servidor para que
  // la vista local refleje los cambios aplicados (y los de otros dispositivos).
  useEffect(() => {
    const onSynced = () => void fetchTasks();
    window.addEventListener("pritio:synced", onSynced);
    return () => window.removeEventListener("pritio:synced", onSynced);
  }, [fetchTasks]);

  // Refresh manual desde la UI (botón en el header).
  useEffect(() => {
    return onAppEvent("pritio:app-refresh", () => void fetchTasks());
  }, [fetchTasks]);

  useEffect(() => {
    const channelScope = workspaceId ?? (multiIds.length > 0 ? [...multiIds].sort().join(",") : "");
    if (!channelScope) return;

    const taskFilter = workspaceId
      ? `workspace_id=eq.${workspaceId}`
      : `workspace_id=in.(${multiIds.join(",")})`;

    channelRef.current?.unsubscribe();

    channelKeyCounter++;
    const channel = supabase
      .channel(`tasks-${channelScope}-${channelKeyCounter}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: taskFilter,
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
          filter: taskFilter,
        },
        () => silentRefresh(),
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [workspaceId, multiIds, silentRefresh]);

  const addTask = useCallback((task: Task) => {
    setTasks((prev) => [task, ...prev]);
  }, []);

  const updateTask = useCallback((task: Task) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = task;
        return next;
      }
      return [task, ...prev];
    });
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
