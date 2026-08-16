import { supabase } from "@/lib/supabase";
import { mapInvitation } from "@/lib/mappers";
import type { Invitation, InvitationRow, MemberType, WorkspaceRole } from "@/types";

export async function createInvitation(
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
  memberType?: MemberType | null,
): Promise<Invitation> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      workspace_id: workspaceId,
      email: email.toLowerCase().trim(),
      role,
      member_type: memberType ?? null,
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return mapInvitation(data as InvitationRow);
}

export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as InvitationRow[]).map(mapInvitation);
}

export async function listMyPendingInvitations(): Promise<Invitation[]> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user?.email) return [];

  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = data as InvitationRow[];
  return rows.filter((r) => r.email === user.user!.email).map(mapInvitation);
}

export async function acceptInvitation(invitation: Invitation): Promise<void> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error("Not authenticated");

  const { error: acceptErr } = await supabase
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (acceptErr) throw acceptErr;

  const { error: memberErr } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: invitation.workspaceId,
      user_id: user.id,
      role: invitation.role,
      member_type: invitation.memberType ?? null,
    });

  if (memberErr) throw memberErr;

  const profile = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  if (profile.data) {
    const { data: existing } = await supabase
      .from("assignees")
      .select("id")
      .eq("workspace_id", invitation.workspaceId)
      .eq("linked_user_id", user.id)
      .maybeSingle();

    if (!existing) {
      const name = profile.data.full_name || profile.data.email?.split("@")[0] || "Miembro";
      await supabase.from("assignees").insert({
        workspace_id: invitation.workspaceId,
        name,
        color: "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0"),
        linked_user_id: user.id,
      });
    }
  }
}

export async function rejectInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId);

  if (error) throw error;
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId);

  if (error) throw error;
}

export async function checkEmailHasInvitation(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_email_has_invitation", {
    p_email: email.toLowerCase().trim(),
  });

  if (error) throw error;
  return data as boolean;
}

export async function sendInvitationEmail(invitationId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("send-invite", {
      body: { invitationId },
    });
    if (error) throw error;
    return (data as { sent: boolean })?.sent ?? false;
  } catch {
    return false;
  }
}
