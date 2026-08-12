import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type Stripe from "stripe";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import {
  getOrCreateStripeCustomer,
  getStripe,
  resolveRedirectUrl,
} from "../_shared/stripe.ts";

// Price catalog per tier × currency × period. The Stripe products follow the
// "Pritio Personal/Familiar/Equipo Pro" naming; prices carry the same metadata.
const PRICE_IDS: Record<
  string,
  Record<"usd" | "mxn", { monthly: string; yearly: string }>
> = {
  personal: {
    usd: {
      monthly: Deno.env.get("STRIPE_PRICE_PRO_PERSONAL_MONTHLY_USD") ?? "",
      yearly: Deno.env.get("STRIPE_PRICE_PRO_PERSONAL_YEARLY_USD") ?? "",
    },
    mxn: {
      monthly: Deno.env.get("STRIPE_PRICE_PRO_PERSONAL_MONTHLY_MXN") ?? "",
      yearly: Deno.env.get("STRIPE_PRICE_PRO_PERSONAL_YEARLY_MXN") ?? "",
    },
  },
  family: {
    usd: {
      monthly: Deno.env.get("STRIPE_PRICE_PRO_FAMILY_MONTHLY_USD") ?? "",
      yearly: Deno.env.get("STRIPE_PRICE_PRO_FAMILY_YEARLY_USD") ?? "",
    },
    mxn: {
      monthly: Deno.env.get("STRIPE_PRICE_PRO_FAMILY_MONTHLY_MXN") ?? "",
      yearly: Deno.env.get("STRIPE_PRICE_PRO_FAMILY_YEARLY_MXN") ?? "",
    },
  },
  team: {
    usd: {
      monthly: Deno.env.get("STRIPE_PRICE_PRO_TEAM_MONTHLY_USD") ?? "",
      yearly: Deno.env.get("STRIPE_PRICE_PRO_TEAM_YEARLY_USD") ?? "",
    },
    mxn: {
      monthly: Deno.env.get("STRIPE_PRICE_PRO_TEAM_MONTHLY_MXN") ?? "",
      yearly: Deno.env.get("STRIPE_PRICE_PRO_TEAM_YEARLY_MXN") ?? "",
    },
  },
};

type Tier = "personal" | "family" | "team";
type Currency = "usd" | "mxn";
type BillingPeriod = "monthly" | "yearly";

interface CheckoutPayload {
  workspaceId: string;
  tier: Tier;
  billingPeriod: BillingPeriod;
  currency: Currency;
  successUrl?: string;
  cancelUrl?: string;
}

const TIERS: Tier[] = ["personal", "family", "team"];
const CURRENCIES: Currency[] = ["usd", "mxn"];
const PERIODS: BillingPeriod[] = ["monthly", "yearly"];

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) return { user: null as null };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { user: null as null };
  return { user: data.user };
}

/** Map a workspace type to its purchasable tier. */
function tierForWorkspaceType(type: string): Tier {
  if (type === "personal") return "personal";
  if (type === "family") return "family";
  return "team";
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const stripe = getStripe();
    if (!stripe) {
      return json({ error: "El procesador de pagos no está configurado todavía." }, 500);
    }

    const { user } = await getAuthenticatedUser(req);
    if (!user) return json({ error: "No autorizado" }, 401);

    const body = (await req.json()) as CheckoutPayload;
    const { workspaceId, tier, billingPeriod, currency } = body;

    if (!workspaceId) {
      return json({ error: "workspaceId es requerido" }, 400);
    }
    if (!TIERS.includes(tier)) {
      return json({ error: "Plan inválido" }, 400);
    }
    if (!PERIODS.includes(billingPeriod)) {
      return json({ error: "Periodo de facturación inválido" }, 400);
    }
    if (!CURRENCIES.includes(currency)) {
      return json({ error: "Moneda inválida" }, 400);
    }

    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("id, type")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      return json({ error: "Workspace no encontrado" }, 404);
    }

    const expectedTier = tierForWorkspaceType(workspace.type as string);
    if (expectedTier !== tier) {
      return json({
        error: `El plan ${tier} no aplica a este workspace (tipo ${workspace.type}).`,
      }, 400);
    }

    const { data: member } = await supabaseAdmin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      return json({ error: "No perteneces a este workspace" }, 403);
    }
    if (member.role !== "owner" && member.role !== "admin") {
      return json({ error: "Solo el propietario puede administrar el plan." }, 403);
    }

    // Block double subscriptions on the same workspace.
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("plan", "pro")
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();
    if (existing) {
      return json({
        error: "Este workspace ya tiene una suscripción activa.",
        code: "already_subscribed",
      }, 400);
    }

    // Quantity = paid seats. Personal has no members; family/team bill per member.
    let quantity = 1;
    if (tier !== "personal") {
      const { count } = await supabaseAdmin
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      quantity = Math.max(1, count ?? 1);
    }

    const priceId = PRICE_IDS[tier]?.[currency]?.[billingPeriod] ?? "";
    if (!priceId) {
      return json({ error: `Precio de ${tier} no configurado.` }, 500);
    }

    const price = await stripe.prices.retrieve(priceId);

    const email = user.email ?? "";
    const customerId = await getOrCreateStripeCustomer(user.id, email);

    const successUrl = resolveRedirectUrl(body.successUrl, "/?checkout=success");
    const cancelUrl = resolveRedirectUrl(body.cancelUrl, "/?checkout=cancelled");

    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { user_id: user.id, workspace_id: workspaceId, tier },
    };

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity }],
      subscription_data: subscriptionData,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        workspace_id: workspaceId,
        tier,
        plan: "pro",
        price_currency: currency,
        unit_amount: String(price.unit_amount ?? ""),
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return json({ url: session.url ?? null });
  } catch (err) {
    console.error("stripe-checkout error:", err);
    return json({ error: err instanceof Error ? err.message : "Error creando el checkout" }, 500);
  }
});
