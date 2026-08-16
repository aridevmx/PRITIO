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

      /* Fetch task dates (rows whose anchors fall inside the window) */
      let taskQuery = supabase
        .from("tasks")
        .select("due_date, start_date, end_date, start_at, end_at")
        .eq("is_active", true)
        .or(
          `due_date.gte.${fromStr},due_date.lte.${toStr},` +
            `start_date.gte.${fromStr},start_date.lte.${toStr},` +
            `end_date.gte.${fromStr},end_date.lte.${toStr},` +
            `start_at.gte.${fromStr}T00:00:00,start_at.lte.${toStr}T23:59:59.999`,
        );

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
        const startDate =
          row.start_date ?? row.due_date ?? (row.start_at ? row.start_at.slice(0, 10) : null);
        const endDate =
          row.end_date ??
          row.due_date ??
          (row.end_at ? row.end_at.slice(0, 10) : null) ??
          startDate;
        [row.due_date, row.start_date, row.end_date, row.start_at?.slice(0, 10), row.end_at?.slice(0, 10)].forEach(
          (d) => {
            if (d && d >= fromStr && d <= toStr) dateSet.add(d.slice(0, 10));
          },
        );
        if (startDate && endDate) {
          const s = startDate < fromStr ? fromStr : startDate;
          const e = endDate > toStr ? toStr : endDate;
          const cur = new Date(`${s}T12:00:00`);
          const last = new Date(`${e}T12:00:00`);
          while (cur.getTime() <= last.getTime()) {
            dateSet.add(localDateStr(cur));
            cur.setDate(cur.getDate() + 1);
          }
        }
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
