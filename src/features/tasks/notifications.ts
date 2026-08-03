import { supabase } from "@/lib/supabase";

type NotificationKind = "assigned" | "updated" | "meeting_created" | "deadline_approaching" | "completed";

export async function notifyTaskChange(
  kind: NotificationKind,
  taskId: string,
  workspaceId: string,
  assigneeIds?: string[],
  changes?: string[],
): Promise<boolean> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return false;

    const { error } = await supabase.functions.invoke("task-notifications", {
      body: {
        kind,
        taskId,
        workspaceId,
        actorUserId: user.user.id,
        assigneeIds,
        changes,
      },
    });
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}
