import Stripe from "npm:stripe";
import { supabaseAdmin } from "./supabase-client.ts";

/** Stripe secret key (test mode for local, live for prod). Empty → gateway off. */
export function getStripe(): Stripe | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) return null;
  return new Stripe(key);
}

export const APP_URL = Deno.env.get("PUBLIC_APP_URL") ??
  Deno.env.get("APP_URL") ??
  "https://app.pritio.com.mx";

/** Map a Stripe subscription.status to the app's allowed statuses. */
export function mapStripeStatus(status: string): string {
  if (status === "active") return "active";
  if (status === "trialing") return "trialing";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "canceled";
}

/** Reuse (or create) a Stripe customer for a user, persisted in profiles. */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single();

  const stored = profile?.stripe_customer_id as string | null | undefined;
  if (stored) return stored;

  const customers = await getStripe()!.customers.list({ email, limit: 1 });
  const existing = customers.data[0];
  const customer = existing ??
    await getStripe()!.customers.create({ email, metadata: { user_id: userId } });

  await supabaseAdmin
    .from("profiles")
    .update({ stripe_customer_id: customer.id })
    .eq("id", userId);

  return customer.id;
}

/** Resolve a user id for a Stripe customer (metadata first, then DB lookup). */
export async function findUserIdByStripeCustomer(
  customerId: string,
  metadataUserId?: string | null,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .single();
  return (profile?.id as string | null | undefined) ?? null;
}

/** Build a redirect URL, trusting the client origin only if it is allowed. */
export function resolveRedirectUrl(
  clientOrigin: string | undefined,
  path: string,
): string {
  if (clientOrigin && isAllowedOrigin(clientOrigin)) {
    return `${clientOrigin}${path}`;
  }
  return `${APP_URL}${path}`;
}

function isAllowedOrigin(url: string): boolean {
  try {
    const u = new URL(url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (local) return u.protocol === "http:" || u.protocol === "https:";
    return u.protocol === "https:" && u.origin === new URL(APP_URL).origin;
  } catch {
    return false;
  }
}
