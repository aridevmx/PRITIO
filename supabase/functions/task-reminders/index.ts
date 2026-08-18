import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { sendEmail, escapeHtml } from "../_shared/email.ts";
import { isNotificationEnabled, type NotificationKind } from "../_shared/notification-prefs.ts";
import { APP_NAME } from "../_shared/app-info.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://pritio.app";

interface ReminderRecord {
  id: string;
  task_id: string;
  remind_at: string;
  created_by: string;
}

interface TaskRecord {
  id: string;
  workspace_id: string;
  title: string;
  kind: string;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  completed_at: string | null;
}

interface WorkspaceRecord {
  id: string;
  name: string;
}

interface ProfileRecord {
  id: string;
  full_name: string | null;
  email: string;
}

interface MemberPrefs {
  user_id: string;
  notification_preferences: Record<string, boolean> | null;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date().toISOString();

    const { data: dueRows, error: fetchError } = await supabaseAdmin
      .from("task_reminders")
      .select("id, task_id, remind_at, created_by")
      .eq("notified", false)
      .lte("remind_at", now)
      .limit(500);

    if (fetchError) throw fetchError;
    const due = (dueRows ?? []) as ReminderRecord[];
    if (due.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No due reminders" }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const taskIds = [...new Set(due.map((r) => r.task_id))];
    const { data: taskRows } = await supabaseAdmin
      .from("tasks")
      .select("id, workspace_id, title, kind, due_date, start_at, end_at, completed_at")
      .in("id", taskIds);
    const tasksById = new Map((taskRows ?? []).map((t: TaskRecord) => [t.id, t]));

    const { data: workspaceRows } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .in(
        "id",
        [...new Set((taskRows ?? []).map((t: TaskRecord) => t.workspace_id))],
      );
    const workspacesById = new Map((workspaceRows ?? []).map((w: WorkspaceRecord) => [w.id, w.name]));

    // Group due reminders per task so recipients are resolved once per task.
    const byTask = new Map<string, ReminderRecord[]>();
    for (const r of due) {
      const list = byTask.get(r.task_id) ?? [];
      list.push(r);
      byTask.set(r.task_id, list);
    }

    let sent = 0;
    let notified = 0;

    for (const [taskId, reminders] of byTask) {
      const task = tasksById.get(taskId);
      if (!task) {
        await markNotified(reminders.map((r) => r.id));
        continue;
      }
      if (task.completed_at) {
        await markNotified(reminders.map((r) => r.id));
        continue;
      }

      const workspaceName = workspacesById.get(task.workspace_id) ?? "Workspace";
      const recipientIds = new Set<string>(reminders.map((r) => r.created_by));

      const { data: assignees } = await supabaseAdmin
        .from("task_assignees")
        .select("assignee_id")
        .eq("task_id", taskId);
      const assigneeIds = (assignees ?? []).map((a) => (a as { assignee_id: string }).assignee_id);

      if (assigneeIds.length > 0) {
        const { data: assigneeRows } = await supabaseAdmin
          .from("assignees")
          .select("linked_user_id")
          .in("id", assigneeIds);
        for (const a of (assigneeRows ?? []) as { linked_user_id: string | null }[]) {
          if (a.linked_user_id) recipientIds.add(a.linked_user_id);
        }
      }

      if (recipientIds.size === 0) {
        await markNotified(reminders.map((r) => r.id));
        continue;
      }

      const { data: memberRows } = await supabaseAdmin
        .from("workspace_members")
        .select("user_id, notification_preferences")
        .eq("workspace_id", task.workspace_id)
        .in("user_id", [...recipientIds]);
      const memberUserIds = new Set<string>(
        (memberRows ?? []).map((m) => (m as MemberPrefs).user_id),
      );
      const prefsByUser = new Map<string, Record<string, boolean> | null>(
        (memberRows ?? []).map((m) => [(m as MemberPrefs).user_id, (m as MemberPrefs).notification_preferences]),
      );

      const recipientUserIds = [...recipientIds].filter((id) => memberUserIds.has(id));
      if (recipientUserIds.length === 0) {
        await markNotified(reminders.map((r) => r.id));
        continue;
      }

      const { data: profileRows } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", recipientUserIds);
      const profilesById = new Map((profileRows ?? []).map((p: ProfileRecord) => [p.id, p]));

      const { html, subject, pushTitle, pushBody } = buildReminderNotification(task, workspaceName);

      for (const reminder of reminders) {
        const recipient = profilesById.get(reminder.created_by);
        if (!recipient?.email) continue;
        const prefs = prefsByUser.get(reminder.created_by);

        try {
          const { error } = await supabaseAdmin.from("notifications").insert({
            user_id: reminder.created_by,
            kind: "task_reminder" as NotificationKind,
            title: pushTitle,
            body: pushBody,
            task_id: taskId,
            workspace_id: task.workspace_id,
            delivery: "both",
          });
          if (error) console.error("Failed to insert reminder notification for", recipient.email, error);
        } catch (err) {
          console.error("Failed to insert reminder notification for", recipient.email, err);
        }

        if (isNotificationEnabled("task_reminder", "email", prefs)) {
          try {
            await sendEmail({ to: recipient.email, subject, html });
            sent++;
          } catch (err) {
            console.error("Failed to send reminder email to", recipient.email, err);
          }
        }

        if (isNotificationEnabled("task_reminder", "push", prefs)) {
          try {
            const { error } = await supabaseAdmin.functions.invoke("send-push", {
              body: { userId: reminder.created_by, title: pushTitle, body: pushBody, url: APP_URL },
            });
            if (error) console.error("Failed to send reminder push to", recipient.email, error);
          } catch (err) {
            console.error("Failed to send reminder push to", recipient.email, err);
          }
        }
      }

      await markNotified(reminders.map((r) => r.id));
      notified += reminders.length;
    }

    return new Response(JSON.stringify({ sent, notified, total: due.length }), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("task-reminders error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

async function markNotified(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin
    .from("task_reminders")
    .update({ notified: true })
    .in("id", ids);
  if (error) console.error("Failed to mark reminders as notified", error);
}

function buildReminderNotification(
  task: TaskRecord,
  workspaceName: string,
): { html: string; subject: string; pushTitle: string; pushBody: string } {
  const isMeeting = task.kind === "meeting";
  const typeLabel = isMeeting ? "Junta" : "Tarea";
  const safeTitle = escapeHtml(task.title);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const subject = `Recordatorio: ${typeLabel} en ${safeWorkspaceName}`;
  const pushTitle = "Recordatorio";
  const pushBodyParts = [task.title, workspaceName];
  if (task.start_at) {
    pushBodyParts.push(new Date(task.start_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }));
  } else if (task.due_date) {
    pushBodyParts.push(`Vence: ${task.due_date}`);
  }
  const pushBody = pushBodyParts.join(" — ");

  const dateLine = task.start_at
    ? escapeHtml(new Date(task.start_at).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" }))
    : task.due_date
      ? `Vence: ${escapeHtml(task.due_date)}`
      : "";

  const html = `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:40px 0">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
          <tr>
            <td style="padding:32px 32px 0;text-align:center">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td style="width:40px;height:40px;background:linear-gradient(135deg,#9B7EDC,#7C3AED);border-radius:50%;text-align:center;vertical-align:middle;font-size:18px;font-weight:800;color:#ffffff;line-height:40px">P</td>
                </tr>
              </table>
              <h1 style="margin:16px 0 4px;font-size:20px;font-weight:800;color:#1c1917">${pushTitle}</h1>
              <p style="margin:0;font-size:14px;color:#71717a">${safeWorkspaceName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#fafaf9;border-radius:12px;padding:16px;margin:16px 0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1c1917">${safeTitle}</p>
                    ${dateLine ? `<p style="margin:0;font-size:12px;color:#71717a">${dateLine}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;text-align:center">
              <a href="${APP_URL}" style="display:inline-block;padding:12px 32px;background-color:#1c1917;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px">Abrir en ${APP_NAME}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;text-align:center;border-top:1px solid #e7e5e4">
              <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa">${APP_NAME} — Prioriza con claridad</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, subject, pushTitle, pushBody };
}
