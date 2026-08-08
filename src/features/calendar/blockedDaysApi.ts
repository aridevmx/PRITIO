import { supabase } from "@/lib/supabase";
import { localDateStr } from "@/lib/utils";
import type { BlockedDayStatus } from "@/types";
import type { SpaceKey } from "@/features/spaces/spaces";

export interface WorkspaceBlockedDay {
  date: string;
  userId: string;
  name: string;
  reason: string | null;
  status: BlockedDayStatus;
}

export interface PendingBlockedDay {
  date: string;
  userId: string;
  name: string;
  reason: string | null;
  createdAt: string;
}

export interface ToggleBlockedDayResult {
  blocked: boolean;
  pending: boolean;
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
 * List blocked days for the whole workspace, including the blocking user's name
 * and approval status. Uses the SECURITY DEFINER RPC `list_workspace_blocked_days`
 * (migration 0020). Falls back to the caller's own blocked days when the RPC is
 * not deployed.
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
      (r: {
        blocked_date: string;
        user_id: string;
        full_name: string;
        reason: string | null;
        status: string;
      }) => ({
        date: String(r.blocked_date).slice(0, 10),
        userId: String(r.user_id),
        name: String(r.full_name ?? "Usuario"),
        reason: r.reason ?? null,
        status: (r.status === "pending" || r.status === "rejected" ? r.status : "approved") as BlockedDayStatus,
      }),
    );
  } catch {
    const rangeFrom = from ?? localDateStr(new Date(new Date().getFullYear() - 1, 0, 1));
    const rangeTo = to ?? localDateStr(new Date(new Date().getFullYear() + 1, 11, 31));
    const { data, error } = await supabase
      .from("user_blocked_days")
      .select("blocked_date, user_id, status")
      .eq("workspace_id", workspaceId)
      .gte("blocked_date", rangeFrom)
      .lte("blocked_date", rangeTo);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      date: String(r.blocked_date).slice(0, 10),
      userId: String(r.user_id),
      name: "",
      reason: null,
      status: (r.status === "pending" || r.status === "rejected" ? r.status : "approved") as BlockedDayStatus,
    }));
  }
}

export async function toggleBlockedDay(
  userId: string,
  workspaceId: string,
  date: string,
  reason?: string,
  autoApproved = true,
): Promise<ToggleBlockedDayResult> {
  const existing = await supabase
    .from("user_blocked_days")
    .select("id, status")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("blocked_date", date)
    .maybeSingle();

  if (existing.error) throw existing.error;

  const nextStatus = autoApproved ? "approved" : "pending";

  if (existing.data) {
    // Rejected: allow re-requesting the same day.
    if (existing.data.status === "rejected") {
      const { error } = await supabase
        .from("user_blocked_days")
        .update({
          status: nextStatus,
          decided_by: null,
          decided_at: null,
          rejection_reason: null,
        })
        .eq("id", existing.data.id);
      if (error) throw error;
      return { blocked: true, pending: !autoApproved };
    }
    const { error } = await supabase
      .from("user_blocked_days")
      .delete()
      .eq("id", existing.data.id);
    if (error) throw error;
    return { blocked: false, pending: false };
  }

  const { error } = await supabase.from("user_blocked_days").insert({
    user_id: userId,
    workspace_id: workspaceId,
    blocked_date: date,
    reason: reason?.trim() || null,
    status: nextStatus,
  });
  if (error) throw error;
  return { blocked: true, pending: !autoApproved };
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
    .eq("blocked_date", date)
    .eq("status", "approved");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function listPendingBlockedDays(
  workspaceId: string,
): Promise<PendingBlockedDay[]> {
  const { data, error } = await supabase.rpc("list_pending_blocked_days", {
    p_workspace_id: workspaceId,
  });
  if (error) throw error;
  return (data ?? []).map(
    (r: {
      blocked_date: string;
      user_id: string;
      full_name: string;
      reason: string | null;
      created_at: string;
    }) => ({
      date: String(r.blocked_date).slice(0, 10),
      userId: String(r.user_id),
      name: String(r.full_name ?? "Usuario"),
      reason: r.reason ?? null,
      createdAt: String(r.created_at ?? ""),
    }),
  );
}

export async function approveBlockedDay(
  workspaceId: string,
  userId: string,
  date: string,
): Promise<void> {
  const { error } = await supabase.rpc("approve_blocked_day", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_date: date,
  });
  if (error) throw error;
}

export async function rejectBlockedDay(
  workspaceId: string,
  userId: string,
  date: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("reject_blocked_day", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_date: date,
    p_reason: reason,
  });
  if (error) throw error;
}
