import { supabase } from "@/lib/supabase";

type NotificationKind =
  | "assigned"
  | "updated"
  | "meeting_created"
  | "deadline_approaching"
  | "completed"
  | "task_approved"
  | "task_rejected"
  | "approval_requested";

export async function notifyTaskChange(
  kind: NotificationKind,
  taskId: string,
  workspaceId: string,
  assigneeIds?: string[],
  changes?: string[],
  recipientUserIds?: string[],
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
        recipientUserIds,
      },
    });
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}
