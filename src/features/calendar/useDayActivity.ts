import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { listBlockedDays, listWorkspaceBlockedDays } from "@/features/calendar/blockedDaysApi";

export interface DayActivity {
  /** Total de tareas + eventos + juntas programadas ese día. */
  count: number;
  blocked: boolean;
  pending: boolean;
}

export type DayActivityMap = Record<string, DayActivity>;

interface UseDayActivityOptions {
  scope: "workspace" | "all";
  workspaceId: string | null;
  userId: string | null;
  from: string;
  to: string;
}

export function useDayActivity({
  scope,
  workspaceId,
  userId,
  from,
  to,
}: UseDayActivityOptions) {
  const [counts, setCounts] = useState<DayActivityMap>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      let wsIds: string[] = [];
      if (scope === "workspace" && workspaceId) {
        wsIds = [workspaceId];
      } else {
        const { data: memberships } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", userId);
        wsIds = (memberships ?? []).map((m) => m.workspace_id);
      }

      if (wsIds.length === 0) {
        setCounts({});
        return;
      }

      const next: DayActivityMap = {};

      /* Tasks / events / meetings grouped by due_date */
      const { data: rows } = await supabase
        .from("tasks")
        .select("due_date")
        .eq("is_active", true)
        .in("workspace_id", wsIds)
        .gte("due_date", from)
        .lte("due_date", to);

      (rows ?? []).forEach((row) => {
        const d = row.due_date;
        if (!d) return;
        const cur = next[d] ?? { count: 0, blocked: false, pending: false };
        cur.count += 1;
        next[d] = cur;
      });

      /* Blocked days */
      if (scope === "workspace" && workspaceId) {
        const blocked = await listWorkspaceBlockedDays(workspaceId, from, to);
        blocked.forEach((b) => {
          const cur = next[b.date] ?? { count: 0, blocked: false, pending: false };
          if (b.status === "approved") cur.blocked = true;
          else if (b.status === "pending") cur.pending = true;
          next[b.date] = cur;
        });
      } else {
        const blocked = await listBlockedDays(userId, null, from, to);
        blocked.forEach((d) => {
          const cur = next[d] ?? { count: 0, blocked: false, pending: false };
          cur.blocked = true;
          next[d] = cur;
        });
      }

      setCounts(next);
    } catch (err) {
      console.error("[useDayActivity] error:", err);
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, [scope, workspaceId, userId, from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { counts, loading, refresh };
}
