import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { localDateStr } from "@/lib/utils";

interface TaskDatesResult {
  taskDates: string[];
  isLoading: boolean;
}

export function useTaskDates(
  workspaceId: string | null,
  userId: string | null,
  rangeMonths = 2,
): TaskDatesResult {
  const [taskDates, setTaskDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - rangeMonths, 1);
      const to = new Date(now.getFullYear(), now.getMonth() + rangeMonths + 1, 0);
      const fromStr = localDateStr(from);
      const toStr = localDateStr(to);

      /* Fetch task dates */
      let taskQuery = supabase
        .from("tasks")
        .select("due_date, start_at")
        .gte("due_date", fromStr)
        .lte("due_date", toStr)
        .eq("is_active", true);

      if (workspaceId) {
        taskQuery = taskQuery.eq("workspace_id", workspaceId);
      } else {
        /* Fetch all workspaces the user belongs to */
        const { data: memberships } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId);
        const wsIds = (memberships ?? []).map((m) => m.workspace_id);
        if (wsIds.length > 0) {
          taskQuery = taskQuery.in("workspace_id", wsIds);
        } else {
          setTaskDates([]);
          return;
        }
      }

      const { data: taskRows, error: taskErr } = await taskQuery;
      if (taskErr) throw taskErr;

      const dateSet = new Set<string>();
      (taskRows ?? []).forEach((row) => {
        if (row.due_date) dateSet.add(row.due_date.slice(0, 10));
        if (row.start_at) dateSet.add(row.start_at.slice(0, 10));
      });
      setTaskDates(Array.from(dateSet));
    } catch (err) {
      console.error("[useTaskDates] fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, userId, rangeMonths]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { taskDates, isLoading };
}
