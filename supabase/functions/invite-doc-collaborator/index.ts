import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Helpers inline (la función es autónoma para desplegarse sin ../_shared) ──

const APP_NAME = "Pritio";
const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://app.pritio.com.mx";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const BASE_CORS_HEADERS: Record<string, string> = {
  "Vary": "Origin",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, x-sb-transport-rpc",
};

const APP_ORIGIN = (() => {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return "";
  }
})();

function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return u.protocol === "http:" || u.protocol === "https:";
    }
    return u.protocol === "https:" && u.origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") ?? null;
  if (!isAllowedOrigin(origin)) return { ...BASE_CORS_HEADERS };
  return { ...BASE_CORS_HEADERS, "Access-Control-Allow-Origin": origin as string };
}

function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  return null;
}

interface Caller {
  userId: string | null;
  role: string | null;
}

/** Decodifica los claims del JWT de Supabase sin verificar (la plataforma ya lo hizo). */
function getCaller(req: Request): Caller {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) return { userId: null, role: null };
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
    return {
      userId: typeof claims.sub === "string" ? claims.sub : null,
      role: typeof claims.role === "string" ? claims.role : null,
    };
  } catch {
    return { userId: null, role: null };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${sanitizeHeader(Deno.env.get("SMTP_FROM_NAME") ?? "PRITIO")} <${sanitizeHeader(Deno.env.get("SMTP_FROM") ?? "pritio@clipot.mx")}>`,
        to: sanitizeHeader(params.to),
        subject: sanitizeHeader(params.subject),
        html: params.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend error (${res.status}): ${await res.text()}`);
    return true;
  }
  console.warn("No email provider configured. Would send:", params.subject);
  return false;
}

// ── Lógica principal ────────────────────────────────────────────────────────

interface InvitePayload {
  docId: string;
  email: string;
  role: "viewer" | "editor";
}

interface DocRecord {
  id: string;
  workspace_id: string;
  title: string;
  created_by: string;
}

interface ProfileRecord {
  id: string;
  full_name: string | null;
  email: string;
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
    const payload = (await req.json()) as InvitePayload;
    const email = (payload.email ?? "").trim().toLowerCase();

    if (!payload.docId || !email || !["viewer", "editor"].includes(payload.role)) {
      return new Response(JSON.stringify({ error: "docId, email and role required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // El actor viene del JWT verificado, nunca del body.
    const caller = getCaller(req);
    if (!caller.userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: doc } = await supabaseAdmin
      .from("docs")
      .select("id, workspace_id, title, created_by")
      .eq("id", payload.docId)
      .maybeSingle();
    const docRecord = doc as unknown as DocRecord | null;

    if (!docRecord) {
      return new Response(JSON.stringify({ error: "Doc not found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Solo el creador del doc o un admin/owner del workspace puede invitar.
    const { data: callerMember } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", docRecord.workspace_id)
      .eq("user_id", caller.userId)
      .maybeSingle();
    const callerRole = (callerMember as { role?: string } | null)?.role;

    const canManage =
      docRecord.created_by === caller.userId ||
      callerRole === "owner" ||
      callerRole === "admin";

    if (!canManage) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ¿El email ya pertenece a un usuario con cuenta?
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .ilike("email", email)
      .maybeSingle();
    const profile = targetProfile as ProfileRecord | null;

    if (profile && profile.id === caller.userId) {
      return new Response(JSON.stringify({ error: "No puedes invitarte a ti mismo" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("doc_collaborators")
      .upsert(
        {
          doc_id: payload.docId,
          workspace_id: docRecord.workspace_id,
          email,
          user_id: profile?.id ?? null,
          role: payload.role,
          invited_by: caller.userId,
        },
        { onConflict: "doc_id,email" },
      )
      .select("id, doc_id, workspace_id, email, user_id, role, invited_by, created_at")
      .single();

    if (insertError) {
      console.error("invite-doc-collaborator insert error:", insertError);
      return new Response(JSON.stringify({ error: "Could not add collaborator" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Correo de invitación (best effort; el acceso ya quedó guardado).
    try {
      const { data: actorProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", caller.userId)
        .maybeSingle();
      const actorName =
        ((actorProfile as Pick<ProfileRecord, "full_name"> | null)?.full_name ?? "").trim() || "Alguien";

      await sendEmail({
        to: email,
        subject: `${actorName} te invitó a colaborar en un documento de ${APP_NAME}`,
        html: buildInviteEmail(actorName, docRecord.title, payload.role),
      });
    } catch (err) {
      console.error("invite-doc-collaborator email error:", err);
    }

    return new Response(JSON.stringify({ collaborator: inserted }), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("invite-doc-collaborator error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});

function buildInviteEmail(actorName: string, docTitle: string, role: "viewer" | "editor"): string {
  const safeActor = escapeHtml(actorName);
  const safeTitle = escapeHtml(docTitle || "Sin título");
  const accessLabel = role === "editor" ? "ver y editar" : "ver";

  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invitación a colaborar</title>
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
              <h1 style="margin:16px 0 4px;font-size:20px;font-weight:800;color:#1c1917">Te invitaron a colaborar</h1>
              <p style="margin:0;font-size:14px;color:#71717a">${safeActor} te dio acceso para ${accessLabel} un documento</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fafaf9;border-radius:12px;padding:16px;margin:0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#1c1917">${safeTitle}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#71717a">${APP_NAME} · Documentos</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 24px;text-align:center">
              <a href="${APP_URL}" style="display:inline-block;padding:12px 32px;background-color:#1c1917;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px">Abrir documento</a>
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
}
