import { supabase } from "@/lib/supabase";
import { mapWorkspace } from "@/lib/mappers";
import type {
  Workspace,
  WorkspaceRow,
  WorkspaceMember,
  WorkspaceMemberRow,
  WorkspaceRole,
  WorkspaceType,
  NotificationPreferences,
} from "@/types";

function mapWorkspaceMember(row: WorkspaceMemberRow): WorkspaceMember {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    memberType: row.member_type,
    agendaShared: row.agenda_shared,
    recapMorningAt: row.recap_morning_at,
    recapEveningAt: row.recap_evening_at,
    recapTimezone: row.recap_timezone,
    approvalGraceSeconds: row.approval_grace_seconds,
    notificationPreferences: row.notification_preferences,
    joinedAt: row.joined_at,
  };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data as WorkspaceRow[]).map(mapWorkspace);
}

export async function createWorkspace(
  name: string,
  type: WorkspaceType,
): Promise<Workspace> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .rpc("create_workspace", {
      p_name: name,
      p_type: type,
      p_user_id: user.id,
    });

  if (error) throw error;

  return mapWorkspace(data as WorkspaceRow);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function leaveWorkspace(id: string): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", id)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function updateWorkspace(
  id: string,
  data: Partial<Pick<Workspace, "name" | "blockedDaysRequireApproval" | "autoPromoteDueToDo">>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.blockedDaysRequireApproval !== undefined)
    payload.blocked_days_require_approval = data.blockedDaysRequireApproval;
  if (data.autoPromoteDueToDo !== undefined)
    payload.auto_promote_due_to_do = data.autoPromoteDueToDo;

  const { error } = await supabase
    .from("workspaces")
    .update(payload)
    .eq("id", id);

  if (error) throw error;
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true });

  if (error) throw error;
  return (data as WorkspaceMemberRow[]).map(mapWorkspaceMember);
}

export async function removeMember(
  workspaceId: string,
  userId: string,
  reassignToAssigneeId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("remove_workspace_member", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_reassign_assignee_id: reassignToAssigneeId ?? null,
  });

  if (error) throw error;
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<void> {
  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function setAgendaShared(
  workspaceId: string,
  value: boolean,
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("workspace_members")
    .update({ agenda_shared: value })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function setRecapSchedule(
  workspaceId: string,
  morning: string | null,
  evening: string | null,
  tz: string,
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("workspace_members")
    .update({
      recap_morning_at: morning,
      recap_evening_at: evening,
      recap_timezone: tz,
    })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function updateNotificationPreferences(
  workspaceId: string,
  prefs: Partial<NotificationPreferences>,
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data: current } = await supabase
    .from("workspace_members")
    .select("notification_preferences")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  const merged = { ...(current?.notification_preferences as NotificationPreferences ?? {}), ...prefs };

  const { error } = await supabase
    .from("workspace_members")
    .update({ notification_preferences: merged })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function setApprovalGraceSeconds(
  workspaceId: string,
  seconds: number,
): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("workspace_members")
    .update({ approval_grace_seconds: seconds })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if (error) throw error;
}


