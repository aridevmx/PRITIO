import { emitAppEvent, onAppEvent } from "@/lib/appEvents";
import type { PlanResource } from "@/types";

/**
 * Plan-limit gate bus. UI gates (and server-error backstops) call
 * `openUpgrade(resource)`; the app-wide `UpgradeHost` listens and shows the
 * upsell modal. Kept framework-agnostic so any component (even ones deep in
 * portals) can trigger the prompt without prop-drilling.
 */

export interface BillingUpgradeEvent {
  resource: PlanResource;
}

export const PLAN_LIMIT_EVENT = "pritio:plan-limit";

export function openUpgrade(resource: PlanResource): void {
  emitAppEvent<BillingUpgradeEvent>(PLAN_LIMIT_EVENT, { resource });
}

export function onPlanLimit(cb: (event: BillingUpgradeEvent) => void): () => void {
  return onAppEvent<BillingUpgradeEvent>(PLAN_LIMIT_EVENT, (payload) => {
    if (payload) cb(payload);
  });
}
