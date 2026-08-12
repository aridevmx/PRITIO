import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { PERMISSIVE_CORS_HEADERS, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { getStripe } from "../_shared/stripe.ts";

/**
 * sync-seats
 *
 * Reconciles the Stripe subscription quantity for a workspace with its current
 * member count. Called by the pg_net trigger on workspace_members changes
 * (see migration 0024).
 *
 * Unauthenticated (verify_jwt = false) by design: it is invoked server-side by
 * the database trigger with no user session. Authorization is enforced with a
 * shared secret: the trigger (notify_seat_sync) sends an
 * `Authorization: Bearer <SYNC_SEATS_SECRET>` header sourced from
 * app_settings.seats_sync_token, and this function validates it against the
 * SYNC_SEATS_SECRET secret. If the secret is not configured on either side the
 * sync is a no-op (fail closed).
 */

const SYNC_SEATS_SECRET = Deno.env.get("SYNC_SEATS_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PERMISSIVE_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface SyncSeatsPayload {
  workspace_id: string;
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req, PERMISSIVE_CORS_HEADERS);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!SYNC_SEATS_SECRET) {
    return json({ ok: false, reason: "sync_not_configured" });
  }
  if (authHeader !== `Bearer ${SYNC_SEATS_SECRET}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const stripe = getStripe();
    if (!stripe) {
      return json({ error: "Stripe no configurado" }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as Partial<SyncSeatsPayload>;
    const workspaceId = body.workspace_id;
    if (!workspaceId) {
      return json({ error: "workspace_id es requerido" }, 400);
    }

    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("plan", "pro")
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();

    if (subError) throw subError;
    if (!subscription || !subscription.stripe_subscription_id) {
      return json({ ok: false, reason: "no_active_subscription" });
    }

    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("type")
      .eq("id", workspaceId)
      .single();
    const isPersonal = workspace?.type === "personal";

    const { count, error: countError } = await supabaseAdmin
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId);
    if (countError) throw countError;

    // Personal workspaces have no paid seats; family/team bill per member.
    const quantity = isPersonal ? 1 : Math.max(1, count ?? 1);

    if (Number(subscription.quantity) !== quantity) {
      const stripeSubscription = await stripe.subscriptions.update(
        String(subscription.stripe_subscription_id),
        {
          quantity,
          proration_behavior: "create_prorations",
        },
      );

      await supabaseAdmin.rpc("upsert_subscription", {
        p_user_id: subscription.user_id,
        p_workspace_id: workspaceId,
        p_plan: "pro",
        p_period_end: subscription.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
          : null,
        p_status: subscription.status,
        p_quantity: quantity,
        p_trial_ends_at: subscription.trial_ends_at,
        p_stripe_subscription_id: subscription.stripe_subscription_id,
      });
    }

    return json({ ok: true, workspace_id: workspaceId, quantity });
  } catch (err) {
    console.error("sync-seats error:", err);
    return json({ error: err instanceof Error ? err.message : "Error sincronizando asientos" }, 500);
  }
});
