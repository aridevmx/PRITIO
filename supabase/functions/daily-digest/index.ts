import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { CORS_HEADERS, handleCors } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { DEFAULT_PREFS } from "../_shared/notification-prefs.ts";
import { buildDigestHtml } from "./template.ts";
import type { DigestTask } from "./template.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://prio.app";

interface SyncTask {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  quadrant: string;
  status: string;
  workspace_id: string;
}

interface WorkspaceName {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface WorkspaceMember {
  workspace_id: string;
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
    // Optional: accept specific user IDs (for manual trigger/testing)
    const body = req.body ? await req.json().catch(() => ({})) : {};
    const targetUserIds: string[] | undefined = body.userIds;

    // Get all active workspace members
    let members: WorkspaceMember[];

    if (targetUserIds) {
      const { data } = await supabaseAdmin
        .from("workspace_members")
        .select("workspace_id, user_id, notification_preferences")
        .in("user_id", targetUserIds);
      members = (data ?? []) as WorkspaceMember[];
    } else {
      const { data } = await supabaseAdmin
        .from("workspace_members")
        .select("workspace_id, user_id, notification_preferences");
      members = (data ?? []) as WorkspaceMember[];
    }

    if (members.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No members found" }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Unique user IDs
    const userIds = [...new Set(members.map((m) => m.user_id))];

    // A user gets the digest if email_daily_digest is enabled in any of their workspaces
    const digestEnabledByUser = new Map<string, boolean>();
    for (const m of members) {
      const enabled = m.notification_preferences?.email_daily_digest ?? DEFAULT_PREFS.email_daily_digest;
      if (enabled) digestEnabledByUser.set(m.user_id, true);
    }

    // Fetch workspace names
    const workspaceIds = [...new Set(members.map((m) => m.workspace_id))];
    const { data: wsData } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);
    const workspaceMap = new Map((wsData ?? []).map((w: WorkspaceName) => [w.id, w.name]));

    // Fetch all user profiles
    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    const profileMap = new Map((profileData ?? []).map((p: Profile) => [p.id, p]));

    // Get today/date boundaries
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Fetch tasks for all relevant workspaces
    const activeWsIds = [...new Set(members.map((m) => m.workspace_id))];
    const { data: tasksData } = await supabaseAdmin
      .from("tasks")
      .select("id, title, due_date, priority, quadrant, status, workspace_id")
      .in("workspace_id", activeWsIds)
      .neq("status", "done")
      .not("due_date", "is", null)
      .lte("due_date", tomorrowStr)
      .order("due_date", { ascending: true });

    const allTasks = (tasksData ?? []) as SyncTask[];

    // Build workspace → user mapping
    const userWorkspaces = new Map<string, string[]>();
    for (const m of members) {
      const list = userWorkspaces.get(m.user_id) ?? [];
      list.push(m.workspace_id);
      userWorkspaces.set(m.user_id, list);
    }

    let sentCount = 0;

    for (const userId of userIds) {
      if (!digestEnabledByUser.get(userId)) continue;
      const profile = profileMap.get(userId);
      if (!profile?.email) continue;

      const userWsIds = userWorkspaces.get(userId) ?? [];
      const userTasks = allTasks.filter((t) => userWsIds.includes(t.workspace_id));

      const overdue: DigestTask[] = [];
      const todayTasks: DigestTask[] = [];
      const upcoming: DigestTask[] = [];

      for (const t of userTasks) {
        const dueDate = t.due_date?.split("T")[0] ?? "";
        const digestTask: DigestTask = {
          title: t.title,
          dueDate: t.due_date,
          priority: t.priority,
          quadrant: t.quadrant,
          workspaceName: workspaceMap.get(t.workspace_id) ?? "Workspace",
        };

        if (dueDate < todayStr) {
          overdue.push(digestTask);
        } else if (dueDate === todayStr) {
          todayTasks.push(digestTask);
        } else if (dueDate === tomorrowStr) {
          upcoming.push(digestTask);
        }
      }

      if (overdue.length === 0 && todayTasks.length === 0 && upcoming.length === 0) {
        continue; // Skip users with nothing to report
      }

      const html = buildDigestHtml({
        userName: profile.full_name ?? profile.email.split("@")[0],
        overdueCount: overdue.length,
        todayCount: todayTasks.length,
        upcomingCount: upcoming.length,
        overdueTasks: overdue,
        todayTasks: todayTasks,
        upcomingTasks: upcoming,
        appUrl: APP_URL,
      });

      await sendEmail({
        to: profile.email,
        subject: `Resumen diario Priorify — ${overdue.length + today.length} tareas pendientes`,
        html,
      });

      sentCount++;
    }

    return new Response(JSON.stringify({ sent: sentCount, total: userIds.length }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("daily-digest error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
