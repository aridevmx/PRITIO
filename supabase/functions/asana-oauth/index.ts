import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { APP_URL } from "../_shared/app-info.ts";

const ASANA_CLIENT_ID = Deno.env.get("ASANA_CLIENT_ID") ?? "";
const ASANA_CLIENT_SECRET = Deno.env.get("ASANA_CLIENT_SECRET") ?? "";

const REDIRECT_URI = `${APP_URL}/oauth/asana/callback`;
const AUTH_URL = "https://app.asana.com/-/oauth_authorize";
const TOKEN_URL = "https://app.asana.com/-/oauth_token";

/** Minimal scopes: read tasks, projects, and workspaces. */
const SCOPES = "tasks:read projects:read workspaces:read";

type Action = "authorize" | "exchange" | "disconnect";

interface AuthorizePayload {
  action: "authorize";
  userId: string;
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
        headers: { "Content-Type": "application/json" },
      });
    }

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

    const body: Payload = await req.json();

    switch (body.action) {
      // ─── AUTHORIZE ──────────────────────────────────────────────
      case "authorize": {
        if (!ASANA_CLIENT_ID) {
          return new Response(
            JSON.stringify({ error: "Asana client ID not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const state = crypto.randomUUID();
        const url = new URL(AUTH_URL);
        url.searchParams.set("client_id", ASANA_CLIENT_ID);
        url.searchParams.set("redirect_uri", REDIRECT_URI);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("state", state);
        url.searchParams.set("scope", SCOPES);

        return new Response(
          JSON.stringify({ url: url.toString(), state }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      // ─── EXCHANGE CODE FOR TOKENS ───────────────────────────────
      case "exchange": {
        if (!ASANA_CLIENT_ID || !ASANA_CLIENT_SECRET) {
          return new Response(
            JSON.stringify({ error: "Asana credentials not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const { code } = body;
        if (!code) {
          return new Response(
            JSON.stringify({ error: "Missing code" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
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
            { status: 502, headers: { "Content-Type": "application/json" } },
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
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            user: { name: tokenData.data?.name, email: tokenData.data?.email },
          }),
          { headers: { "Content-Type": "application/json" } },
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
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: true }),
          { headers: { "Content-Type": "application/json" } },
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
    }
  } catch (err) {
    console.error("asana-oauth error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
