import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useBilling } from "@/features/billing/BillingProvider";
import {
  CURRENCY_LABELS,
  TIER_DESCRIPTIONS,
  TIER_LABELS,
  TIER_PLAN_LIMIT_SUMMARY,
  PRICING,
  formatPrice,
  tierForWorkspaceType,
} from "@/features/billing/plans";
import { createCheckout, openBillingPortal } from "@/features/billing/api";
import { useToast } from "@/components/Toast";
import type { BillingCurrency, BillingPeriod, BillingTier } from "@/types";

interface SubscriptionsModalProps {
  onClose: () => void;
}

const FREE_FEATURES = [
  "Matriz de Eisenhower",
  "Juntas y reuniones recurrentes",
  "Calendario con días bloqueados",
  "Límites según el tipo de workspace",
];

const PRO_FEATURES: Record<BillingTier, string[]> = {
  personal: [
    "300 proyectos",
    "2,500 tareas activas",
    "200 responsables",
    "Todo lo del plan Gratis",
  ],
  family: [
    "Hasta 10 miembros",
    "50,000 tareas activas",
    "100 proyectos",
    "Cada miembro paga su lugar",
  ],
  team: [
    "Hasta 50 miembros",
    "100,000 tareas activas",
    "500 proyectos",
    "Cada miembro paga su lugar",
  ],
};

export function SubscriptionsModal({ onClose }: SubscriptionsModalProps) {
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const { effectivePlan, currentSubscription, proTrialUsed, refresh } = useBilling();
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const [currency, setCurrency] = useState<BillingCurrency>("usd");
  const [checkingOut, setCheckingOut] = useState<BillingTier | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasPro = effectivePlan === "pro";
  const currentTier = currentWorkspace
    ? tierForWorkspaceType(currentWorkspace.type)
    : null;
  const memberCount = useWorkspaceMembers();

  async function handleChoose(tier: BillingTier) {
    if (!currentWorkspace) return;
    setCheckingOut(tier);
    try {
      const result = await createCheckout(
        currentWorkspace.id,
        tier,
        period,
        currency,
      );
      if (result.url) window.location.assign(result.url);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "already_subscribed") {
        toast.error("Este workspace ya tiene una suscripción activa.");
        void handleManage();
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo iniciar el checkout");
      }
    } finally {
      setCheckingOut(null);
    }
  }

  async function handleManage() {
    setOpeningPortal(true);
    try {
      const result = await openBillingPortal();
      if (result.url) window.location.assign(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo abrir el portal de pago");
    } finally {
      setOpeningPortal(false);
    }
  }

  const statusLabel = hasPro
    ? currentSubscription?.status === "trialing"
      ? "Prueba activa"
      : currentSubscription?.status === "past_due"
        ? "Pago pendiente"
        : "Suscripción activa"
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
        {/* Header */}
        <div className="border-b border-line px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pritio-purple to-pritio-blue text-lg font-bold text-white">
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L13.5 4V8C13.5 11.5 11 14.5 8 15C5 14.5 2.5 11.5 2.5 8V4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold leading-snug text-ink">Planes de PRITIO</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Cada workspace paga su propio plan. Personal sin miembros; Familiar y Equipo por miembro.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar planes"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Estado actual */}
          {hasPro && currentTier && (
            <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-pritio-blue/10 px-4 py-3 text-sm text-pritio-blue">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L13.5 4V8C13.5 11.5 11 14.5 8 15C5 14.5 2.5 11.5 2.5 8V4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M6 8L7.5 9.5L10.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-semibold">
                {TIER_LABELS[currentTier]} activo en este workspace
              </span>
              {statusLabel && <span className="text-xs opacity-80">{statusLabel}</span>}
            </div>
          )}

          {hasPro && (
            <div className="mb-5">
              <button
                type="button"
                onClick={() => void handleManage()}
                disabled={openingPortal}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted transition-colors disabled:opacity-60"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M1.5 4.5L8 1.5L14.5 4.5V7C14.5 10.5 11.7 13.3 8 14.5C4.3 13.3 1.5 10.5 1.5 7V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M6 8L7.2 9.2L10 6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {openingPortal ? "Abriendo portal..." : "Administrar suscripción"}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-ink-muted">
                Cambia tu método de pago, descarga facturas o cancela desde Stripe.
              </p>
            </div>
          )}

          {/* Toggles: periodo + moneda */}
          <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex rounded-xl bg-surface-muted p-1">
              {(
                [
                  { value: "monthly", label: "Mensual" },
                  { value: "yearly", label: "Anual · ahorra" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50",
                    period === opt.value
                      ? "bg-white text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-xl bg-surface-muted p-1">
              {(["usd", "mxn"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50",
                    currency === c
                      ? "bg-white text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {CURRENCY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Prueba */}
          {!proTrialUsed && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-pritio-blue/30 bg-pritio-blue/5 px-4 py-3 text-xs text-ink-soft">
              <svg className="h-4 w-4 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L13.5 4V8C13.5 11.5 11 14.5 8 15C5 14.5 2.5 11.5 2.5 8V4L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M5.5 8L7.2 9.7L10.8 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                Prueba Pro <span className="font-semibold">14 días gratis</span> en tu
                primer workspace. La prueba se usa una sola vez por cuenta.
              </span>
            </div>
          )}

          {/* Tarjetas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Free */}
            <PlanCard
              name="Gratis"
              description="Para empezar a organizar tu día."
              price={null}
              priceNote={null}
              features={FREE_FEATURES}
              accent="border-line"
              ctaLabel="Gratis para siempre"
              ctaDisabled={!hasPro}
              badge={!hasPro ? "Tu plan actual" : null}
              onChoose={() => onClose()}
            />

            {(Object.keys(PRICING) as BillingTier[]).map((tier) => {
              const applies = currentTier === tier;
              const isCurrent = hasPro && applies;
              const price = PRICING[tier][currency][period];
              const perMember = tier !== "personal";
              return (
                <PlanCard
                  key={tier}
                  name={TIER_LABELS[tier]}
                  description={TIER_DESCRIPTIONS[tier]}
                  price={formatPrice(price, currency)}
                  priceNote={
                    perMember
                      ? `/ miembro / mes`
                      : period === "monthly"
                        ? "/ mes"
                        : `/ mes`
                  }
                  features={PRO_FEATURES[tier]}
                  accent={
                    isCurrent
                      ? "border-pritio-blue/50 ring-1 ring-pritio-blue/20"
                      : "border-line"
                  }
                  highlight={applies}
                  ctaLabel={
                    isCurrent
                      ? "Tu plan actual"
                      : !applies
                        ? "Requiere otro workspace"
                        : `Elegir ${TIER_LABELS[tier]}`
                  }
                  ctaDisabled={isCurrent || !applies}
                  badge={
                    isCurrent
                      ? "Tu plan actual"
                      : applies && !hasPro
                        ? "Recomendado"
                        : null
                  }
                  busy={checkingOut === tier}
                  onChoose={() => void handleChoose(tier)}
                />
              );
            })}
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-ink-muted">
            Familiar y Equipo cobran por miembro. Con{" "}
            <span className="font-semibold text-ink-soft">{Math.max(1, memberCount)}</span>{" "}
            {memberCount === 1 ? "miembro" : "miembros"} en este workspace, un plan{" "}
            {currentTier ? TIER_LABELS[currentTier] : "Pro"} sale en{" "}
            <span className="font-semibold text-ink-soft">
              {formatPrice(
                currentTier && currentTier !== "personal"
                  ? PRICING[currentTier][currency][period] * Math.max(1, memberCount)
                  : currentTier
                    ? PRICING[currentTier][currency][period]
                    : 0,
                currency,
              )}
            </span>
            {period === "monthly" ? "/mes" : "/mes · facturado al año"}. Los pagos se
            procesan de forma segura con <span className="font-semibold text-ink-soft">Stripe</span>.
          </p>
          <p className="mt-1 text-center text-xs text-ink-muted">
            Límites Pro por tipo — {currentTier ? TIER_PLAN_LIMIT_SUMMARY[currentTier] : "Personal, Familiar y Equipo"}.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Live member count of the current workspace. */
function useWorkspaceMembers(): number {
  const { members } = useWorkspace();
  return members.length;
}

interface PlanCardProps {
  name: string;
  description: string;
  price: string | null;
  priceNote: string | null;
  features: string[];
  accent: string;
  highlight?: boolean;
  ctaLabel: string;
  ctaDisabled: boolean;
  badge?: string | null;
  busy?: boolean;
  onChoose: () => void;
}

function PlanCard({
  name,
  description,
  price,
  priceNote,
  features,
  accent,
  highlight = false,
  ctaLabel,
  ctaDisabled,
  badge,
  busy = false,
  onChoose,
}: PlanCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-surface p-5 transition-shadow",
        accent,
        highlight && "shadow-lg shadow-pritio-blue/5",
      )}
    >
      {badge && (
        <span
          className={cn(
            "absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            highlight
              ? "bg-gradient-to-r from-pritio-purple to-pritio-blue text-white"
              : "bg-surface-muted text-ink-soft",
          )}
        >
          {badge}
        </span>
      )}
      <h3 className="text-sm font-bold text-ink">{name}</h3>
      <p className="mt-1 min-h-8 text-xs leading-relaxed text-ink-muted">{description}</p>

      <div className="mt-3 flex items-baseline gap-1">
        {price ? (
          <>
            <span className="text-2xl font-bold tracking-tight text-ink">{price}</span>
            <span className="text-xs text-ink-muted">{priceNote}</span>
          </>
        ) : (
          <span className="text-2xl font-bold tracking-tight text-ink">$0</span>
        )}
      </div>

      <ul className="mt-4 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-ink-soft">
            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={ctaDisabled || busy}
        onClick={onChoose}
        className={cn(
          "mt-5 w-full rounded-xl px-3 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed",
          highlight
            ? "bg-gradient-to-r from-pritio-purple to-pritio-blue text-white shadow-sm hover:opacity-90 disabled:opacity-60"
            : "border border-line text-ink hover:bg-surface-muted disabled:opacity-60",
        )}
      >
        {busy ? "Preparando..." : ctaLabel}
      </button>
    </div>
  );
}
