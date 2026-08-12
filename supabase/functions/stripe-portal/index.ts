import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { getStripe, resolveRedirectUrl } from "../_shared/stripe.ts";

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token) return { user: null as null };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { user: null as null };
  return { user: data.user };
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, req);
  }

  try {
    const stripe = getStripe();
    if (!stripe) {
      return json({ error: "El procesador de pagos no está configurado todavía." }, 500, req);
    }

    const { user } = await getAuthenticatedUser(req);
    if (!user) return json({ error: "No autorizado" }, 401, req);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    const customerId = profile?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      return json({ error: "No tienes un cliente de pago todavía." }, 400, req);
    }

    const body = (await req.json().catch(() => ({}))) as { returnUrl?: string };
    const returnUrl = resolveRedirectUrl(body.returnUrl, "");

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return json({ url: session.url ?? null }, 200, req);
  } catch (err) {
    console.error("stripe-portal error:", err);
    return json({ error: err instanceof Error ? err.message : "Error abriendo el portal" }, 500, req);
  }
});
