import type {
  BillingCurrency,
  BillingPeriod,
  BillingTier,
  Subscription,
  WorkspacePlan,
  WorkspaceType,
} from "@/types";

/**
 * Plan metadata + pricing (see PRICING.md).
 *
 * Model (per workspace):
 *   free  → always free, per-workspace-type limits (see limits.ts)
 *   pro   → paid subscription for ONE workspace; each workspace pays its own
 *           plan. Personal has no members; Familiar/Equipo bill per member.
 *
 * Currency: USD and MXN are both offered; the user picks at checkout.
 */

export const PLAN_LABELS: Record<WorkspacePlan, string> = {
  free: "Gratis",
  pro: "Pro",
};

export const PLAN_DESCRIPTIONS: Record<WorkspacePlan, string> = {
  free: "Organiza tu día con la matriz de Eisenhower. Siempre gratis.",
  pro: "Límites altos para tu workspace, según su tipo.",
};

export const PLAN_BADGE_CLASSES: Record<WorkspacePlan, string> = {
  free: "bg-surface-muted text-ink-muted",
  pro: "bg-pritio-blue/10 text-pritio-blue",
};

export const TIER_LABELS: Record<BillingTier, string> = {
  personal: "Personal Pro",
  family: "Familiar Pro",
  team: "Equipo Pro",
};

export const TIER_DESCRIPTIONS: Record<BillingTier, string> = {
  personal: "Para ti. Sin miembros, un workspace personal.",
  family: "Para tu familia o grupo cercano. Precio por miembro.",
  team: "Para tu equipo de trabajo. Precio por miembro.",
};

export const TIER_PLAN_LIMIT_SUMMARY: Record<BillingTier, string> = {
  personal: "300 proyectos · 2,500 tareas",
  family: "10 miembros · 50,000 tareas · 100 proyectos",
  team: "50 miembros · 100,000 tareas · 500 proyectos",
};

/**
 * Prices per tier × currency × period.
 *   personal → price for the whole workspace (1 seat).
 *   family/team → price per member per period.
 * Tasa de referencia: 1 USD ≈ 17.2 MXN (agosto 2026).
 */
export const PRICING: Record<
  BillingTier,
  Record<BillingCurrency, Record<BillingPeriod, number>>
> = {
  personal: {
    usd: { monthly: 3, yearly: 29.99 },
    mxn: { monthly: 49, yearly: 499 },
  },
  family: {
    usd: { monthly: 4, yearly: 40 },
    mxn: { monthly: 69, yearly: 699 },
  },
  team: {
    usd: { monthly: 6, yearly: 60 },
    mxn: { monthly: 99, yearly: 999 },
  },
};

/** Purchasable tier for a workspace type (enterprise behaves as team). */
export function tierForWorkspaceType(type: WorkspaceType): BillingTier {
  if (type === "personal") return "personal";
  if (type === "family") return "family";
  return "team";
}

export function formatPrice(value: number, currency: BillingCurrency): string {
  return new Intl.NumberFormat(currency === "usd" ? "en-US" : "es-MX", {
    style: "currency",
    currency: currency === "usd" ? "USD" : "MXN",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export const CURRENCY_LABELS: Record<BillingCurrency, string> = {
  usd: "USD",
  mxn: "MXN",
};

export function isPaidPlan(plan: WorkspacePlan): boolean {
  return plan === "pro";
}

const ACTIVE_STATUSES = new Set<Subscription["status"]>(["active", "trialing", "past_due"]);

/** True when a subscription is still granting Pro entitlements. */
export function isActiveSubscription(subscription: Subscription): boolean {
  return ACTIVE_STATUSES.has(subscription.status);
}

/** Effective plan for a specific workspace from its subscriptions. */
export function effectivePlanForWorkspace(
  subscriptions: Subscription[],
  workspaceId: string | null | undefined,
): WorkspacePlan {
  if (
    workspaceId &&
    subscriptions.some(
      (s) => s.workspaceId === workspaceId && isActiveSubscription(s),
    )
  ) {
    return "pro";
  }
  return "free";
}
