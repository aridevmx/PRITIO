import { useEffect, useState } from "react";
import { onPlanLimit, type BillingUpgradeEvent } from "@/features/billing/upgrade";
import { UpgradePrompt } from "@/features/billing/UpgradePrompt";
import { SubscriptionsModal } from "@/features/billing/SubscriptionsModal";

/**
 * App-wide host for the plan-limit upsell flow. Mounted once in AppShell:
 * listens for `pritio:plan-limit` events emitted by UI gates and server-error
 * backstops, and renders the UpgradePrompt (→ SubscriptionsModal). Also
 * reopens the plans modal after a successful Stripe checkout redirect.
 */
export function UpgradeHost() {
  const [pending, setPending] = useState<BillingUpgradeEvent | null>(null);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => onPlanLimit((event) => setPending(event)), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setShowPlans(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  return (
    <>
      {pending && (
        <UpgradePrompt
          resource={pending.resource}
          onClose={() => setPending(null)}
          onViewPlans={() => {
            setPending(null);
            setShowPlans(true);
          }}
        />
      )}
      {showPlans && <SubscriptionsModal onClose={() => setShowPlans(false)} />}
    </>
  );
}
