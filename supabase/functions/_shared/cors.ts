import { APP_URL } from "./app-info.ts";

const BASE_HEADERS: Record<string, string> = {
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

/** True for the app origin and local dev origins (localhost / 127.0.0.1). */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
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

/**
 * Per-request CORS headers for browser-facing endpoints. The origin is echoed
 * only when it is allowed; anything else gets no ACAO header (browser blocks it).
 */
export function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") ?? null;
  if (!isAllowedOrigin(origin)) return { ...BASE_HEADERS };
  return { ...BASE_HEADERS, "Access-Control-Allow-Origin": origin as string };
}

/**
 * Machine-to-machine endpoints (Stripe webhook, pg_net → sync-seats) never run
 * in a browser, so a permissive policy is safe there.
 */
export const PERMISSIVE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, x-sb-transport-rpc",
};

export function handleCors(
  req: Request,
  headers: Record<string, string> = corsHeaders(req),
): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  return null;
}
