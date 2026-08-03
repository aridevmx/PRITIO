import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { CORS_HEADERS, handleCors } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { isNotificationEnabled, type NotificationKind } from "../_shared/notification-prefs.ts";
import { APP_NAME } from "../_shared/app-info.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://prio.app";

interface TaskNotificationPayload {
  kind: NotificationKind;
  taskId: string;
  workspaceId: string;
  actorUserId: string;
  assigneeIds?: string[];
  changes?: string[];
}

interface TaskRecord {
  id: string;
  title: string;
  kind: string;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  meeting_link: string | null;
  location: string | null;
  description: string | null;
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
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const payload: TaskNotificationPayload = await req.json();

    if (!payload.taskId || !payload.workspaceId || !payload.kind) {
      return new Response(JSON.stringify({ error: "taskId, workspaceId, and kind required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const [task, workspace, actor, recipients] = await Promise.all([
      supabaseAdmin.from("tasks").select("id, title, kind, due_date, start_at, end_at, meeting_link, location, description").eq("id", payload.taskId).single().then((r) => r.data as unknown as TaskRecord | null),
      supabaseAdmin.from("workspaces").select("id, name").eq("id", payload.workspaceId).single().then((r) => r.data as unknown as WorkspaceRecord | null),
      supabaseAdmin.from("profiles").select("id, full_name, email").eq("id", payload.actorUserId).single().then((r) => r.data as unknown as ProfileRecord | null),
      getRecipients(payload.assigneeIds ?? []),
    ]);

    if (!task || !workspace) {
      return new Response(JSON.stringify({ error: "Task or workspace not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!recipients.length) {
      return new Response(JSON.stringify({ sent: 0, message: "No recipients" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const prefsByUser = await getPrefsByUser(payload.workspaceId, recipients.map((r) => r.id));
    const actorName = actor?.full_name ?? "Alguien";
    const { html, subject, pushTitle, pushBody } = buildNotification(payload.kind, task, workspace.name, actorName, payload.changes);

    let sent = 0;
    for (const recipient of recipients) {
      if (recipient.id === payload.actorUserId) continue;
      const prefs = prefsByUser.get(recipient.id);

      // Notificación in-app: la campana siempre la recibe; si el kind es
      // "toast-worthy", además se muestra un toast efímero en la app.
      try {
        const { error } = await supabaseAdmin.from("notifications").insert({
          user_id: recipient.id,
          kind: payload.kind,
          title: pushTitle,
          body: pushBody,
          task_id: payload.taskId,
          workspace_id: payload.workspaceId,
          delivery: deliveryFor(payload.kind),
        });
        if (error) console.error("Failed to insert in-app notification for", recipient.email, error);
      } catch (err) {
        console.error("Failed to insert in-app notification for", recipient.email, err);
      }

      if (isNotificationEnabled(payload.kind, "email", prefs)) {
        try {
          await sendEmail({ to: recipient.email, subject, html });
          sent++;
        } catch (err) {
          console.error("Failed to send email to", recipient.email, err);
        }
      }

      if (isNotificationEnabled(payload.kind, "push", prefs)) {
        try {
          const { error } = await supabaseAdmin.functions.invoke("send-push", {
            body: { userId: recipient.id, title: pushTitle, body: pushBody, url: APP_URL },
          });
          if (error) console.error("Failed to send push to", recipient.email, error);
        } catch (err) {
          console.error("Failed to send push to", recipient.email, err);
        }
      }
    }

    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("task-notifications error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

const TOAST_KINDS = new Set<NotificationKind>(["assigned", "meeting_created", "deadline_approaching"]);

function deliveryFor(kind: NotificationKind): "toast" | "bell" | "both" {
  return TOAST_KINDS.has(kind) ? "both" : "bell";
}

async function getRecipients(assigneeIds: string[]): Promise<ProfileRecord[]> {
  if (!assigneeIds.length) return [];

  const { data: assignees } = await supabaseAdmin
    .from("assignees")
    .select("linked_user_id")
    .in("id", assigneeIds);

  const userIds = (assignees ?? [])
    .map((a: Record<string, unknown>) => a.linked_user_id as string)
    .filter(Boolean);

  if (!userIds.length) return [];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  return (profiles ?? []) as ProfileRecord[];
}

async function getPrefsByUser(workspaceId: string, userIds: string[]): Promise<Map<string, Record<string, boolean> | null>> {
  const map = new Map<string, Record<string, boolean> | null>();
  if (!userIds.length) return map;

  const { data: members } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id, notification_preferences")
    .eq("workspace_id", workspaceId)
    .in("user_id", userIds);

  for (const m of (members ?? []) as MemberPrefs[]) {
    map.set(m.user_id, m.notification_preferences);
  }
  return map;
}

function buildNotification(
  kind: NotificationKind,
  task: TaskRecord,
  workspaceName: string,
  actorName: string,
  changes?: string[],
): { html: string; subject: string; pushTitle: string; pushBody: string } {
  const taskUrl = `${APP_URL}`;
  const isMeeting = task.kind === "meeting";
  const typeLabel = isMeeting ? "Junta" : "Tarea";

  const subjects: Record<NotificationKind, string> = {
    assigned: `Te asignaron ${isMeeting ? "una junta" : "una tarea"} en ${workspaceName}`,
    updated: `${typeLabel} actualizada en ${workspaceName}`,
    meeting_created: `Nueva junta en ${workspaceName}`,
    deadline_approaching: `${typeLabel} por vencer en ${workspaceName}`,
    completed: `${typeLabel} completada en ${workspaceName}`,
  };

  const titles: Record<NotificationKind, string> = {
    assigned: `Te asignaron ${isMeeting ? "una junta" : "una tarea"}`,
    updated: `${typeLabel} actualizada`,
    meeting_created: "Nueva junta",
    deadline_approaching: "Por vencer",
    completed: `${typeLabel} completada`,
  };

  const detailsHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:#fafaf9;border-radius:12px;padding:16px;margin:16px 0">
      <tr>
        <td>
          <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1c1917">${task.title}</p>
          <p style="margin:0;font-size:12px;color:#71717a">${workspaceName}${task.due_date ? ` · Vence: ${task.due_date}` : ""}</p>
          ${isMeeting && task.start_at ? `<p style="margin:4px 0 0;font-size:12px;color:#71717a">${new Date(task.start_at).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}${task.end_at ? ` — ${new Date(task.end_at).toLocaleTimeString("es-MX", { timeStyle: "short" })}` : ""}</p>` : ""}
          ${task.description ? `<p style="margin:8px 0 0;font-size:13px;color:#57534e">${task.description}</p>` : ""}
          ${changes && changes.length ? `<p style="margin:8px 0 0;font-size:12px;color:#a1a1aa">Cambios: ${changes.join(", ")}</p>` : ""}
        </td>
      </tr>
    </table>`;

  const pushBodyParts = [workspaceName];
  if (task.due_date) pushBodyParts.push(`Vence: ${task.due_date}`);
  if (isMeeting && task.start_at) {
    pushBodyParts.push(new Date(task.start_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }));
  }
  if (changes && changes.length) pushBodyParts.push(`Cambios: ${changes.join(", ")}`);
  const pushBody = `${task.title} — ${pushBodyParts.join(" · ")}`;

  const html = `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subjects[kind]}</title>
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
              <h1 style="margin:16px 0 4px;font-size:20px;font-weight:800;color:#1c1917">${titles[kind]}</h1>
              <p style="margin:0;font-size:14px;color:#71717a">${actorName} en ${workspaceName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px">
              ${detailsHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;text-align:center">
              <a href="${taskUrl}" style="display:inline-block;padding:12px 32px;background-color:#1c1917;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px">Abrir en ${APP_NAME}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;text-align:center;border-top:1px solid #e7e5e4">
              <p style="margin:16px 0 0;font-size:11px;color:#a1a1aa">${APP_NAME} — Open source task management</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, subject: subjects[kind], pushTitle: titles[kind], pushBody };
}
