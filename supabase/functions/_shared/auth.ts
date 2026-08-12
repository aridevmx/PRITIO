export interface Caller {
  userId: string | null;
  role: string | null;
}

/** Decode the claims of a Supabase JWT without verifying (platform already did). */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Identify the caller from the Authorization header.
 * User tokens carry `sub` (user id) and `role: "authenticated"`; the
 * service-role key carries `role: "service_role"` and no `sub`.
 */
export function getCaller(req: Request): Caller {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) return { userId: null, role: null };
  const claims = parseJwtPayload(token);
  if (!claims) return { userId: null, role: null };
  return {
    userId: typeof claims.sub === "string" ? claims.sub : null,
    role: typeof claims.role === "string" ? claims.role : null,
  };
}
