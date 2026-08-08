import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type Stripe from "stripe";
import { CORS_HEADERS, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { getStripe, mapStripeStatus } from "../_shared/stripe.ts";

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function syncProSubscription(
  userId: string,
  workspaceId: string,
  status: string,
  currentPeriodEnd?: number | null,
  quantity: number = 1,
  trialEndsAt?: number | null,
  stripeSubscriptionId?: string | null,
) {
  const { error } = await supabaseAdmin.rpc("upsert_subscription", {
    p_user_id: userId,
    p_workspace_id: workspaceId,
    p_plan: "pro",
    p_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    p_status: status,
    p_quantity: quantity,
    p_trial_ends_at: trialEndsAt ? new Date(trialEndsAt * 1000).toISOString() : null,
    p_stripe_subscription_id: stripeSubscriptionId ?? null,
  });
  if (error) throw error;
}

/** Subscription quantity: stripe_subscription.quantity or the first item's. */
function subscriptionQuantity(subscription: Stripe.Subscription): number {
  const q = subscription.quantity ?? subscription.items.data[0]?.quantity ?? 1;
  return Math.max(1, Number(q));
}

async function markTrialUsedIfEligible(userId: string) {
  const { error } = await supabaseAdmin.rpc("mark_pro_trial_used", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("stripe-webhook: mark_pro_trial_used failed:", error.message);
  }
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const stripe = getStripe();
  if (!stripe) {
    return json({ error: "Stripe no configurado" }, 500);
  }
  if (!WEBHOOK_SECRET) {
    return json({ error: "STRIPE_WEBHOOK_SECRET no configurado" }, 500);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Firma faltante" }, 400);
  }

  let event: Stripe.Event;
  try {
    const payload = await req.text();
    event = await stripe.webhooks.constructEventAsync(payload, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error("stripe-webhook signature error:", err);
    return json({ error: "Firma inválida" }, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata ?? {};
        if (session.mode === "subscription" && metadata.plan === "pro" && metadata.user_id) {
          // A Pro purchase of any kind consumes the one-time trial for the account.
          await markTrialUsedIfEligible(metadata.user_id);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const meta = subscription.metadata ?? {};
        const workspaceId = meta.workspace_id;
        if (!workspaceId || !meta.user_id) {
          console.warn("stripe-webhook: subscription sin workspace_id en metadata", subscription.id);
          break;
        }
        const status = mapStripeStatus(subscription.status);
        await syncProSubscription(
          meta.user_id,
          workspaceId,
          status,
          subscription.current_period_end,
          subscriptionQuantity(subscription),
          subscription.trial_end,
          subscription.id,
        );
        if (subscription.trial_end) {
          await markTrialUsedIfEligible(meta.user_id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const meta = subscription.metadata ?? {};
        if (!meta.workspace_id || !meta.user_id) {
          break;
        }
        await syncProSubscription(
          meta.user_id,
          meta.workspace_id,
          "canceled",
          subscription.current_period_end,
          subscriptionQuantity(subscription),
          null,
          subscription.id,
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;
        const sub = await stripe.subscriptions.retrieve(String(invoice.subscription));
        const meta = sub.metadata ?? {};
        if (!meta.workspace_id || !meta.user_id) break;
        await syncProSubscription(
          meta.user_id,
          meta.workspace_id,
          "past_due",
          sub.current_period_end,
          subscriptionQuantity(sub),
          sub.trial_end,
          sub.id,
        );
        break;
      }
    }

    return json({ received: true });
  } catch (err) {
    console.error("stripe-webhook handling error:", err);
    return json({ error: err instanceof Error ? err.message : "Error procesando evento" }, 500);
  }
});
