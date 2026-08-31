import { supabase } from "@/lib/supabase";

/**
 * Client-side wrappers for the Asana OAuth + import Edge Functions.
 * All secrets live server-side; only user-scoped tokens are stored in
 * the `asana_connections` table.
 */

// ── OAuth ────────────────────────────────────────────────────

export async function getAsanaAuthorizeUrl(): Promise<
  { url: string; state: string } | { error: string }
> {
  const { data, error } = await supabase.functions.invoke("asana-oauth", {
    body: { action: "authorize" },
  });
  if (error) return { error: error.message ?? "Failed to get authorize URL" };
  return data as { url: string; state: string };
}

export async function exchangeAsanaCode(
  code: string,
): Promise<{ ok: boolean; user?: { name: string; email: string }; error?: string }> {
  const { data, error } = await supabase.functions.invoke("asana-oauth", {
    body: { action: "exchange", code },
  });
  if (error) return { ok: false, error: error.message ?? "Exchange failed" };
  return data as { ok: boolean; user?: { name: string; email: string } };
}

export async function disconnectAsana(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("asana-oauth", {
    body: { action: "disconnect" },
  });
  if (error) return { ok: false, error: error.message ?? "Disconnect failed" };
  return data as { ok: boolean };
}

// ── Import ───────────────────────────────────────────────────

export interface ImportResult {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: number;
  projectsCount: number;
  error?: string;
}

export async function importAsanaTasks(
  workspaceId: string,
): Promise<ImportResult> {
  const { data, error } = await supabase.functions.invoke("asana-import", {
    body: { workspaceId },
  });
  if (error) return { ok: false, imported: 0, skipped: 0, errors: 0, projectsCount: 0, error: error.message ?? "Import failed" };
  return data as ImportResult;
}

// ── Connection status ────────────────────────────────────────

export interface AsanaConnectionInfo {
  asana_user_id: string;
  created_at: string;
}

export async function getAsanaConnection(): Promise<AsanaConnectionInfo | null> {
  const { data, error } = await supabase
    .from("asana_connections")
    .select("asana_user_id, created_at")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as AsanaConnectionInfo;
}
