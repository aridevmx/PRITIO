import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Helpers inline (la función es autónoma para desplegarse sin ../_shared) ──

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

/** JSON response con CORS en todas las respuestas (no solo el preflight). */
function jsonHeaders(req: Request): Record<string, string> {
  return { ...corsHeaders(req), "Content-Type": "application/json" };
}

/** Nonce de OAuth: solo caracteres URL-safe, 8-128 bytes (evita states vacíos/inyectados). */
function isValidState(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

const ASANA_CLIENT_ID = Deno.env.get("ASANA_CLIENT_ID") ?? "";
const ASANA_CLIENT_SECRET = Deno.env.get("ASANA_CLIENT_SECRET") ?? "";

const REDIRECT_URI = `${APP_URL}/oauth/asana/callback`;
const AUTH_URL = "https://app.asana.com/-/oauth_authorize";
const TOKEN_URL = "https://app.asana.com/-/oauth_token";

/** Minimal scopes: read tasks, projects, and workspaces. */
const SCOPES = "tasks:read projects:read workspaces:read";

interface AuthorizePayload {
  action: "authorize";
  userId: string;
  state?: string;
}

interface ExchangePayload {
  action: "exchange";
  code: string;
  state?: string;
  userId: string;
}

interface DisconnectPayload {
  action: "disconnect";
  userId: string;
}

type Payload = AuthorizePayload | ExchangePayload | DisconnectPayload;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: jsonHeaders(req),
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: jsonHeaders(req),
      });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders(req),
      });
    }

    const body: Payload = await req.json();

    switch (body.action) {
      // ─── AUTHORIZE ──────────────────────────────────────────────
      case "authorize": {
        if (!ASANA_CLIENT_ID) {
          return new Response(
            JSON.stringify({ error: "Asana client ID not configured" }),
            { status: 500, headers: jsonHeaders(req) },
          );
        }

        const state =
          body.state && isValidState(body.state) ? body.state : crypto.randomUUID();
        const url = new URL(AUTH_URL);
        url.searchParams.set("client_id", ASANA_CLIENT_ID);
        url.searchParams.set("redirect_uri", REDIRECT_URI);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("state", state);
        url.searchParams.set("scope", SCOPES);

        return new Response(
          JSON.stringify({ url: url.toString(), state }),
          { headers: jsonHeaders(req) },
        );
      }

      // ─── EXCHANGE CODE FOR TOKENS ───────────────────────────────
      case "exchange": {
        if (!ASANA_CLIENT_ID || !ASANA_CLIENT_SECRET) {
          return new Response(
            JSON.stringify({ error: "Asana credentials not configured" }),
            { status: 500, headers: jsonHeaders(req) },
          );
        }

        const { code, state } = body;
        if (!code) {
          return new Response(
            JSON.stringify({ error: "Missing code" }),
            { status: 400, headers: jsonHeaders(req) },
          );
        }
        if (!isValidState(state)) {
          return new Response(
            JSON.stringify({ error: "Missing or invalid state" }),
            { status: 400, headers: jsonHeaders(req) },
          );
        }

        // Exchange code for tokens (Asana requires this to be server-side).
        const formBody = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: ASANA_CLIENT_ID,
          client_secret: ASANA_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          code,
        });

        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody.toString(),
        });

        if (!tokenRes.ok) {
          const err = await tokenRes.text();
          console.error("Asana token exchange failed:", err);
          return new Response(
            JSON.stringify({ error: "Token exchange failed", details: err }),
            { status: 502, headers: jsonHeaders(req) },
          );
        }

        const tokenData = await tokenRes.json();
        const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

        // Upsert connection (one per user).
        const { error: dbErr } = await supabaseAdmin
          .from("asana_connections")
          .upsert(
            {
              user_id: userData.user.id,
              asana_user_id: tokenData.data?.gid ?? "",
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expires_at: expiresAt,
              scope: SCOPES,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

        if (dbErr) {
          console.error("Failed to save Asana connection:", dbErr);
          return new Response(
            JSON.stringify({ error: "Failed to save connection" }),
            { status: 500, headers: jsonHeaders(req) },
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            user: { name: tokenData.data?.name, email: tokenData.data?.email },
          }),
          { headers: jsonHeaders(req) },
        );
      }

      // ─── DISCONNECT ─────────────────────────────────────────────
      case "disconnect": {
        const { error: delErr } = await supabaseAdmin
          .from("asana_connections")
          .delete()
          .eq("user_id", userData.user.id);

        if (delErr) {
          return new Response(
            JSON.stringify({ error: "Failed to disconnect" }),
            { status: 500, headers: jsonHeaders(req) },
          );
        }

        return new Response(
          JSON.stringify({ ok: true }),
          { headers: jsonHeaders(req) },
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: jsonHeaders(req) },
        );
    }
  } catch (err) {
    console.error("asana-oauth error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: jsonHeaders(req) },
    );
  }
});
