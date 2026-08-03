import { supabase } from "@/lib/supabase";

export interface MyData {
  exportedAt: string;
  profile: Record<string, unknown> | null;
  workspaces: unknown[];
  blockedDays: unknown[];
  tasks: unknown[];
  meetings: unknown[];
  invitations: unknown[];
  pushSubscriptions: unknown[];
}

export async function exportMyData(): Promise<MyData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const [profileRes, membersRes, blockedRes, invitesRes, subsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("workspace_members").select("workspace_id, role").eq("user_id", user.id),
    supabase.from("user_blocked_days").select("*").eq("user_id", user.id),
    supabase.from("invitations").select("*").eq("invited_by", user.id),
    supabase.from("push_subscriptions").select("*").eq("user_id", user.id),
  ]);

  const workspaceIds = (membersRes.data ?? []).map((m) => m.workspace_id);
  const empty = Promise.resolve({ data: [] });

  const [tasksRes, meetingsRes] = await Promise.all([
    workspaceIds.length
      ? supabase
          .from("tasks")
          .select("*")
          .in("workspace_id", workspaceIds)
          .order("created_at", { ascending: false })
      : empty,
    workspaceIds.length
      ? supabase.from("tasks").select("*").eq("kind", "meeting").in("workspace_id", workspaceIds)
      : empty,
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: (profileRes.data as Record<string, unknown> | null) ?? null,
    workspaces: membersRes.data ?? [],
    blockedDays: blockedRes.data ?? [],
    tasks: tasksRes.data ?? [],
    meetings: meetingsRes.data ?? [],
    invitations: invitesRes.data ?? [],
    pushSubscriptions: subsRes.data ?? [],
  };
}

export function downloadJson(data: MyData, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
