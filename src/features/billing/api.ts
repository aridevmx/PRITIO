import { supabase } from "@/lib/supabase";
import { mapSubscription } from "@/lib/mappers";
import type {
  BillingCurrency,
  BillingPeriod,
  BillingTier,
  Subscription,
  SubscriptionRow,
  WorkspacePlan,
} from "@/types";

/**
 * Billing API. Subscription rows are read-only from the client (RLS); the
 * checkout, portal and webhook live server-side as edge functions backed by
 * `upsert_subscription` (service_role only).
 */

export async function listSubscriptions(): Promise<Subscription[]> {
  const { data, error } = await supabase.rpc("list_subscriptions");
  if (error) throw error;
  return ((data ?? []) as SubscriptionRow[]).map(mapSubscription);
}

export interface UsageSnapshotResponse {
  members: number;
  activeTasks: number;
  projects: number;
  assignees: number;
  blockedDays: number;
  agendaEvents: number;
  plan: WorkspacePlan;
  trialEndsAt: string | null;
}

/** Member-guarded usage snapshot for a workspace (RPC `current_usage`). */
export async function fetchUsageForWorkspace(
  workspaceId: string,
): Promise<UsageSnapshotResponse | null> {
  const { data, error } = await supabase.rpc("current_usage", {
    p_workspace_id: workspaceId,
  });
  if (error) {
    console.warn("[billing] current_usage failed:", error.message);
    return null;
  }
  if (!data) return null;
  const raw = data as {
    members: number;
    active_tasks: number;
    projects: number;
    assignees: number;
    blocked_days: number;
    agenda_events: number;
    plan: string;
    trial_ends_at: string | null;
  };
  return {
    members: raw.members ?? 0,
    activeTasks: raw.active_tasks ?? 0,
    projects: raw.projects ?? 0,
    assignees: raw.assignees ?? 0,
    blockedDays: raw.blocked_days ?? 0,
    agendaEvents: raw.agenda_events ?? 0,
    plan: raw.plan === "pro" ? "pro" : "free",
    trialEndsAt: raw.trial_ends_at ?? null,
  };
}

/** Start the 14-day per-workspace Pro trial (owner/admin of family/team). */
export async function startProTrial(workspaceId: string): Promise<void> {
  const { error } = await supabase.rpc("start_pro_trial", {
    p_workspace_id: workspaceId,
  });
  if (error) {
    const code =
      typeof error.message === "string" &&
      error.message.match(/prio_plan_limit:([a-z_]+)/i)?.[1];
    const err = new Error(error.message) as Error & { code?: string };
    if (code) err.code = code;
    throw err;
  }
}

/**
 * Start a Stripe Checkout for a workspace. The edge function resolves the
 * price (tier × currency × period) and computes the paid seats from the
 * workspace's current members. Returns a redirect URL.
 */
export async function createCheckout(
  workspaceId: string,
  tier: BillingTier,
  billingPeriod: BillingPeriod,
  currency: BillingCurrency,
): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: {
      workspaceId,
      tier,
      billingPeriod,
      currency,
      successUrl: window.location.origin,
      cancelUrl: window.location.origin,
    },
  });
  if (error) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : error instanceof Error ? error.message : "No se pudo iniciar el checkout";
    const err = new Error(message) as Error & { code?: string };
    if (typeof data?.code === "string") err.code = data.code;
    throw err;
  }
  if (!data?.url) {
    throw new Error("El checkout no devolvió una URL de pago.");
  }
  return { url: data.url as string };
}

/**
 * Open the Stripe Customer Portal (payment methods, invoices, cancel/upgrade).
 * Only available once a Stripe customer exists for the user.
 */
export async function openBillingPortal(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-portal", {
    body: { returnUrl: window.location.origin },
  });
  if (error) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : error instanceof Error ? error.message : "No se pudo abrir el portal";
    throw new Error(message);
  }
  if (!data?.url) {
    throw new Error("El portal no devolvió una URL.");
  }
  return { url: data.url as string };
}
