import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";

const ASANA_API = "https://app.asana.com/api/1.0";
const TOKEN_URL = "https://app.asana.com/-/oauth_token";
const ASANA_CLIENT_ID = Deno.env.get("ASANA_CLIENT_ID") ?? "";
const ASANA_CLIENT_SECRET = Deno.env.get("ASANA_CLIENT_SECRET") ?? "";

// ── helpers ────────────────────────────────────────────────────

interface ImportPayload {
  workspaceId: string;
}

interface AsanaTask {
  gid: string;
  name: string;
  notes: string | null;
  due_on: string | null;
  completed: boolean;
  assignee?: { gid: string; name: string } | null;
  memberships?: Array<{
    section?: { gid: string; name: string } | null;
  }>;
}

interface AsanaProject {
  gid: string;
  name: string;
  archived: boolean;
}

async function refreshAccessToken(conn: {
  user_id: string;
  refresh_token: string;
}): Promise<string | null> {
  const formBody = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ASANA_CLIENT_ID,
    client_secret: ASANA_CLIENT_SECRET,
    refresh_token: conn.refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody.toString(),
  });

  if (!res.ok) {
    console.error("Asana token refresh failed:", await res.text());
    return null;
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();

  await supabaseAdmin
    .from("asana_connections")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? conn.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", conn.user_id);

  return data.access_token;
}

async function asanaFetch(
  accessToken: string,
  path: string,
): Promise<unknown> {
  const res = await fetch(`${ASANA_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asana API ${res.status}: ${err}`);
  }
  const json = await res.json();
  return json.data;
}

// ── main ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: ImportPayload = await req.json();
    const { workspaceId } = body;
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "Missing workspaceId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify user owns this workspace
    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .single();

    if (wsErr || !ws) {
      return new Response(JSON.stringify({ error: "Workspace not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get Asana connection
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("asana_connections")
      .select("access_token, refresh_token, expires_at, user_id")
      .eq("user_id", userData.user.id)
      .single();

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: "No Asana connection found. Connect first." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Refresh token if expired
    let accessToken = conn.access_token;
    if (new Date(conn.expires_at).getTime() < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(conn);
      if (!refreshed) {
        return new Response(
          JSON.stringify({ error: "Asana token refresh failed. Please reconnect." }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      accessToken = refreshed;
    }

    // Fetch Asana projects
    let projects: AsanaProject[];
    try {
      projects = (await asanaFetch(accessToken, "/projects?archived=false&opt_fields=name,archived")) as AsanaProject[];
    } catch (err) {
      console.error("Failed to fetch Asana projects:", err);
      return new Response(
        JSON.stringify({ error: "Failed to fetch Asana projects" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // For each project, fetch tasks and insert
    for (const project of projects) {
      let tasks: AsanaTask[];
      try {
        tasks = (await asanaFetch(
          accessToken,
          `/projects/${project.gid}/tasks?opt_fields=name,notes,due_on,completed,assignee,memberships.section.name&completed_since=now&limit=100`,
        )) as AsanaTask[];
      } catch {
        errors++;
        continue;
      }

      for (const task of tasks) {
        if (task.completed) {
          skipped++;
          continue;
        }

        // Check for duplicate by external_id
        const { data: existing } = await supabaseAdmin
          .from("tasks")
          .select("id")
          .eq("external_source", "asana")
          .eq("external_id", task.gid)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        const { error: insErr } = await supabaseAdmin.from("tasks").insert({
          workspace_id: workspaceId,
          title: task.name,
          description: task.notes || "",
          quadrant: "later",
          kind: "task",
          due_date: task.due_on || null,
          created_by: userData.user.id,
          external_source: "asana",
          external_id: task.gid,
          visibility: "workspace",
        });

        if (insErr) {
          console.error(`Failed to insert task ${task.gid}:`, insErr);
          errors++;
        } else {
          imported++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        imported,
        skipped,
        errors,
        projectsCount: projects.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("asana-import error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
