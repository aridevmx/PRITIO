import { createPortal } from "react-dom";
import { useBilling } from "@/features/billing/BillingProvider";
import {
  PLAN_LABELS,
  PLAN_BADGE_CLASSES,
} from "@/features/billing/plans";
import { formatLimit, PLAN_RESOURCE_LABELS, limitFor, usageFor } from "@/features/billing/limits";
import { cn } from "@/lib/utils";
import type { PlanResource } from "@/types";

interface UpgradePromptProps {
  resource: PlanResource;
  onClose: () => void;
  onViewPlans: () => void;
}

export function UpgradePrompt({ resource, onClose, onViewPlans }: UpgradePromptProps) {
  const { effectivePlan, currentLimits, usage } = useBilling();

  const resourceLabel = PLAN_RESOURCE_LABELS[resource];
  const current = usageFor(usage, resource);
  const limit = limitFor(currentLimits, resource);
  const progress = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
        <div className="relative overflow-hidden px-6 pt-6 pb-5">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-pritio-blue/10 via-transparent to-transparent"
            aria-hidden
          />
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pritio-blue/10 text-pritio-blue">
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M8 1.5L13.5 4V8C13.5 11.5 11 14.5 8 15C5 14.5 2.5 11.5 2.5 8V4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M6 8L7.5 9.5L10.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="mt-3 text-base font-bold text-ink">
              Llegaste al límite de {resourceLabel.toLowerCase()}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">
              Tu plan{" "}
              <span
                className={cn(
                  "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  PLAN_BADGE_CLASSES[effectivePlan],
                )}
              >
                {PLAN_LABELS[effectivePlan]}
              </span>{" "}
              permite {formatLimit(limit)} {resourceLabel.toLowerCase()}.{" "}
              {effectivePlan === "free"
                ? "Activa Pro para aumentar los límites de este workspace."
                : "Tu plan Pro ya alcanza este límite para el tipo de workspace actual."}
            </p>
          </div>
        </div>

        <div className="px-6 pb-5">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-ink-muted">En uso</span>
            <span className="text-ink">
              {formatLimit(current)} / {formatLimit(limit)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pritio-blue to-pritio-purple transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-line bg-surface-muted/40 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={onViewPlans}
            className="flex-1 rounded-xl bg-gradient-to-r from-pritio-purple to-pritio-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Ver planes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
