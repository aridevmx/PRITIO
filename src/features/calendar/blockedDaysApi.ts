import { supabase } from "@/lib/supabase";
import { localDateStr } from "@/lib/utils";
import type { SpaceKey } from "@/features/spaces/spaces";

export interface WorkspaceBlockedDay {
  date: string;
  userId: string;
  name: string;
}

/**
 * Blocked days only apply in the "trabajo" space and only when the workspace
 * has active members (someone else besides the current user).
 */
export function blockedDaysEnabled(space: SpaceKey, memberCount: number): boolean {
  return space === "trabajo" && memberCount >= 2;
}

export async function listBlockedDays(
  userId: string,
  workspaceId?: string | null,
  from?: string,
  to?: string,
): Promise<string[]> {
  let query = supabase
    .from("user_blocked_days")
    .select("blocked_date")
    .eq("user_id", userId);

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }
  if (from) {
    query = query.gte("blocked_date", from);
  }
  if (to) {
    query = query.lte("blocked_date", to);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => r.blocked_date);
}

/**
 * List blocked days for the whole workspace, including the blocking user's name.
 * Uses the SECURITY DEFINER RPC `list_workspace_blocked_days` (applied in migration
 * 0013). Falls back to the caller's own blocked days when the RPC is not deployed.
 */
export async function listWorkspaceBlockedDays(
  workspaceId: string,
  from?: string,
  to?: string,
): Promise<WorkspaceBlockedDay[]> {
  try {
    const { data, error } = await supabase.rpc("list_workspace_blocked_days", {
      p_workspace_id: workspaceId,
      p_from: from ?? null,
      p_to: to ?? null,
    });
    if (error) throw error;
    return (data ?? []).map(
      (r: { blocked_date: string; user_id: string; full_name: string }) => ({
        date: String(r.blocked_date).slice(0, 10),
        userId: String(r.user_id),
        name: String(r.full_name ?? "Usuario"),
      }),
    );
  } catch {
    const rangeFrom = from ?? localDateStr(new Date(new Date().getFullYear() - 1, 0, 1));
    const rangeTo = to ?? localDateStr(new Date(new Date().getFullYear() + 1, 11, 31));
    const { data, error } = await supabase
      .from("user_blocked_days")
      .select("blocked_date, user_id")
      .eq("workspace_id", workspaceId)
      .gte("blocked_date", rangeFrom)
      .lte("blocked_date", rangeTo);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      date: String(r.blocked_date).slice(0, 10),
      userId: String(r.user_id),
      name: "",
    }));
  }
}

export async function toggleBlockedDay(
  userId: string,
  workspaceId: string,
  date: string,
): Promise<boolean> {
  const existing = await supabase
    .from("user_blocked_days")
    .select("id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("blocked_date", date)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await supabase
      .from("user_blocked_days")
      .delete()
      .eq("id", existing.data.id);
    if (error) throw error;
    return false;
  } else {
    const { error } = await supabase
      .from("user_blocked_days")
      .insert({ user_id: userId, workspace_id: workspaceId, blocked_date: date });
    if (error) throw error;
    return true;
  }
}

export async function isDateBlocked(
  userId: string,
  workspaceId: string,
  date: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_blocked_days")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("blocked_date", date);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
