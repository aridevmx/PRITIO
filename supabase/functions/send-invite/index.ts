import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CORS_HEADERS, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { sendEmail } from "../_shared/email.ts";
import { buildInviteEmailHtml, buildRoleLabel } from "./template.ts";

interface InvitePayload {
  invitationId: string;
}

interface InviteRecord {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  invited_by: string;
  accepted_at: string | null;
}

interface WorkspaceRecord {
  id: string;
  name: string;
}

interface ProfileRecord {
  id: string;
  full_name: string;
}

const APP_URL = Deno.env.get("APP_URL") ?? "https://prio.app";

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
    const { invitationId } = (await req.json()) as InvitePayload;

    if (!invitationId) {
      return new Response(JSON.stringify({ error: "invitationId is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: invitation, error: invError } = await supabaseAdmin
      .from("invitations")
      .select("*")
      .eq("id", invitationId)
      .single();

    if (invError || !invitation) {
      return new Response(JSON.stringify({ error: "Invitation not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const inv = invitation as unknown as InviteRecord;

    if (inv.accepted_at) {
      return new Response(JSON.stringify({ error: "Invitation already accepted" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: workspace, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .select("name")
      .eq("id", inv.workspace_id)
      .single();

    if (wsError || !workspace) {
      return new Response(JSON.stringify({ error: "Workspace not found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const ws = workspace as unknown as WorkspaceRecord;

    const { data: inviter } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", inv.invited_by)
      .single();

    const inviterProfile = inviter as unknown as ProfileRecord | null;

    const inviteLink = `${APP_URL}/invitacion/${inv.id}`;
    const roleLabel = buildRoleLabel(inv.role);
    const invitedByName = inviterProfile?.full_name || "Alguien";

    const html = buildInviteEmailHtml({
      workspaceName: ws.name,
      invitedByName,
      inviteLink,
      roleLabel,
    });

    const sent = await sendEmail({
      to: inv.email,
      subject: `Te invitaron a unirte a ${ws.name} en PRIO`,
      html,
    });

    return new Response(JSON.stringify({ sent, inviteLink }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-invite error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
