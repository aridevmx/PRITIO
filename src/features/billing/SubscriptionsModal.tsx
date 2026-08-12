import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { listMembers } from "@/features/workspaces/api";
import { useBilling } from "@/features/billing/BillingProvider";
import {
  CURRENCY_LABELS,
  PRICING,
  TIER_DESCRIPTIONS,
  effectivePlanForWorkspace,
  formatPrice,
  tierForWorkspaceType,
} from "@/features/billing/plans";
import { formatLimit, getLimits } from "@/features/billing/limits";
import { createCheckout, openBillingPortal } from "@/features/billing/api";
import { useToast } from "@/components/Toast";
import type {
  BillingCurrency,
  BillingPeriod,
  BillingTier,
  PlanLimits,
  Workspace,
  WorkspaceRole,
  WorkspaceType,
} from "@/types";

interface SubscriptionsModalProps {
  onClose: () => void;
}

const TIERS: BillingTier[] = ["personal", "family", "team"];

const TIER_NAMES: Record<BillingTier, string> = {
  personal: "Personal",
  family: "Familia",
  team: "Equipo",
};

const TYPE_NAMES: Record<WorkspaceType, string> = {
  personal: "Personal",
  family: "Familia",
  team: "Equipo",
};

const TIER_ICON_PATHS: Record<BillingTier, ReactNode> = {
  personal: (
    <>
      <circle cx="8" cy="5" r="2.2" />
      <path d="M4 13.4c.5-2.2 2.2-3.4 4-3.4s3.5 1.2 4 3.4" />
    </>
  ),
  family: (
    <>
      <circle cx="6" cy="4.6" r="1.8" />
      <path d="M2.6 12.4c.5-1.9 1.9-3 3.4-3s2.9 1.1 3.4 3" />
      <circle cx="11" cy="6" r="1.5" />
      <path d="M9.9 12.4c.3-1.5 1.4-2.4 2.6-2.4s2.3.9 2.6 2.4" />
    </>
  ),
  team: (
    <>
      <circle cx="5.5" cy="4.8" r="1.6" />
      <circle cx="10.5" cy="4.8" r="1.6" />
      <path d="M2 13.1c.4-1.7 1.8-2.7 3.5-2.7s3.1 1 3.5 2.7" />
      <path d="M7 13.1c.4-1.7 1.8-2.7 3.5-2.7s3.1 1 3.5 2.7" />
    </>
  ),
};

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  leader: "Líder",
  member: "Miembro",
};

const ROLE_CHIP: Record<WorkspaceRole, string> = {
  owner: "bg-pritio-coral/15 text-pritio-coral",
  admin: "bg-pritio-blue/15 text-pritio-blue",
  leader: "bg-pritio-purple/15 text-pritio-purple",
  member: "bg-surface-muted text-ink-muted",
};

interface WorkspaceInfo {
  memberCount: number;
  canManage: boolean;
  role: WorkspaceRole | null;
}

export function SubscriptionsModal({ onClose }: SubscriptionsModalProps) {
  const { toast } = useToast();
  const {
    currentWorkspace,
    workspaces,
    profile,
    deleteWorkspace,
    leaveWorkspace,
  } = useWorkspace();
  const { subscriptions, trialEndsAt, refresh } = useBilling();
  const [view, setView] = useState<"plans" | "subscriptions">("plans");
  const [tier, setTier] = useState<BillingTier>("personal");
  const [period, setPeriod] = useState<BillingPeriod>("yearly");
  const [currency, setCurrency] = useState<BillingCurrency>("mxn");
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [deletingWs, setDeletingWs] = useState<string | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<
    Record<string, WorkspaceInfo>
  >({});
  const [selectedByTier, setSelectedByTier] = useState<
    Partial<Record<BillingTier, string>>
  >({});

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const myId = profile?.id ?? null;

    void (async () => {
      const info: Record<string, WorkspaceInfo> = {};
      for (const ws of workspaces) {
        try {
          const members = await listMembers(ws.id);
          if (cancelled) return;
          const me = myId ? members.find((m) => m.userId === myId) : null;
          info[ws.id] = {
            memberCount: members.length,
            canManage: me?.role === "owner" || me?.role === "admin",
            role: me?.role ?? null,
          };
        } catch {
          if (cancelled) return;
          info[ws.id] = { memberCount: 1, canManage: false, role: null };
        }
      }
      if (!cancelled) setWorkspaceInfo(info);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaces, profile?.id]);

  const tierWorkspaces = useMemo(() => {
    const map: Record<BillingTier, Workspace[]> = {
      personal: [],
      family: [],
      team: [],
    };
    for (const ws of workspaces) {
      map[tierForWorkspaceType(ws.type)].push(ws);
    }
    return map;
  }, [workspaces]);

  function selectedWorkspace(t: BillingTier): Workspace | null {
    const list = tierWorkspaces[t];
    if (list.length === 0) return null;
    const saved = selectedByTier[t];
    if (saved && list.some((w) => w.id === saved)) {
      return list.find((w) => w.id === saved) ?? null;
    }
    if (currentWorkspace && list.some((w) => w.id === currentWorkspace.id)) {
      return list.find((w) => w.id === currentWorkspace.id) ?? null;
    }
    return list[0];
  }

  const savingsPct = Math.round(
    (1 - PRICING[tier][currency].yearly / 12 / PRICING[tier][currency].monthly) * 100,
  );

  async function handleChoose(ws: Workspace, t: BillingTier) {
    setCheckingOut(ws.id);
    try {
      const result = await createCheckout(ws.id, t, period, currency);
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

  async function handleRemove(ws: Workspace, role: WorkspaceRole | null) {
    const isOwner = role === "owner";
    const hasPro = effectivePlanForWorkspace(subscriptions, ws.id) === "pro";
    const verb = isOwner ? "Eliminar" : "Salir de";
    const question = hasPro
      ? `«${ws.name}» tiene un plan Pro activo. Cancélalo antes desde «Administrar suscripción». ¿${verb} «${ws.name}» de todas formas?`
      : isOwner
        ? `¿Eliminar «${ws.name}»? No se puede deshacer.`
        : `¿Salir de «${ws.name}»?`;
    if (!window.confirm(question)) return;

    setDeletingWs(ws.id);
    try {
      if (isOwner) {
        await deleteWorkspace(ws.id);
        toast.success("Workspace eliminado.");
      } else {
        await leaveWorkspace(ws.id);
        toast.success("Saliste del workspace.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo completar la acción");
    } finally {
      setDeletingWs(null);
    }
  }

  const activeTierWs = selectedWorkspace(tier);
  const activeInfo = activeTierWs ? workspaceInfo[activeTierWs.id] : undefined;
  const activeIsPro = Boolean(
    activeTierWs &&
      effectivePlanForWorkspace(subscriptions, activeTierWs.id) === "pro",
  );
  const activeSub = activeTierWs
    ? subscriptions.find((s) => s.workspaceId === activeTierWs.id)
    : undefined;
  const activePrice = PRICING[tier][currency][period];
  const activePerMember = tier !== "personal";
  const activeMemberCount = Math.max(1, activeInfo?.memberCount ?? 1);
  const activeTotal = activePerMember ? activePrice * activeMemberCount : activePrice;
  const activeCanPurchase = Boolean(activeTierWs && activeInfo?.canManage && !activeIsPro);

  const activeStatusLabel = activeSub?.status === "trialing"
    ? "Prueba activa"
    : activeSub?.status === "past_due"
      ? "Pago pendiente"
      : null;

  function renderRow(ws: Workspace) {
    const info = workspaceInfo[ws.id];
    const role = info?.role ?? null;
    const t = tierForWorkspaceType(ws.type);
    const isPro = effectivePlanForWorkspace(subscriptions, ws.id) === "pro";
    const sub = subscriptions.find((s) => s.workspaceId === ws.id);
    const price = PRICING[t][currency][period];
    const perMember = t !== "personal";
    const memberCount = Math.max(1, info?.memberCount ?? 1);
    const canManage = Boolean(info?.canManage);
    const isActive = ws.id === currentWorkspace?.id;
    const busy = checkingOut === ws.id || deletingWs === ws.id;

    return (
      <div
        key={ws.id}
        className={cn(
          "rounded-2xl border bg-surface p-4",
          isActive ? "border-pritio-blue/40 ring-1 ring-pritio-blue/10" : "border-line",
        )}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pritio-blue/10 text-pritio-blue">
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              {TIER_ICON_PATHS[t]}
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-ink">{ws.name}</p>
              {isActive && (
                <span className="rounded-full bg-pritio-blue/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pritio-blue">
                  Activo
                </span>
              )}
            </div>
            <p className="text-[11px] text-ink-muted">
              {TYPE_NAMES[ws.type]}
              {info ? ` · ${memberCount} ${memberCount === 1 ? "miembro" : "miembros"}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {role && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", ROLE_CHIP[role])}>
                {ROLE_LABELS[role]}
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                isPro ? "bg-pritio-blue/15 text-pritio-blue" : "bg-surface-muted text-ink-muted",
              )}
            >
              {isPro ? "Pro" : "Gratis"}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {isPro ? (
            <button
              type="button"
              onClick={() => void handleManage()}
              disabled={openingPortal}
              className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M1.5 4.5L8 1.5L14.5 4.5V7C14.5 10.5 11.7 13.3 8 14.5C4.3 13.3 1.5 10.5 1.5 7V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              {openingPortal ? "Abriendo..." : "Administrar suscripción"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canManage || busy}
              onClick={() => void handleChoose(ws, t)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed",
                canManage
                  ? "bg-gradient-to-r from-pritio-purple to-pritio-blue text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                  : "border border-line text-ink-muted disabled:opacity-60",
              )}
            >
              {checkingOut === ws.id
                ? "Preparando..."
                : canManage
                  ? "Activar Pro"
                  : "Solo el propietario activa"}
            </button>
          )}

          {sub?.status === "trialing" && (
            <span className="text-[11px] font-semibold text-pritio-blue">Prueba activa</span>
          )}
          {sub?.status === "past_due" && (
            <span className="text-[11px] font-semibold text-pritio-coral">Pago pendiente</span>
          )}

          {isPro && perMember && info && (
            <span className="text-[11px] text-ink-muted">
              {memberCount} {memberCount === 1 ? "miembro" : "miembros"} →{" "}
              <span className="font-semibold text-ink-soft">{formatPrice(price * memberCount, currency)}/mes</span>
            </span>
          )}

          <span className="ml-auto flex items-center gap-1">
            {role === "owner" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRemove(ws, role)}
                title="Eliminar workspace"
                aria-label={`Eliminar ${ws.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-pritio-coral/10 hover:text-pritio-coral disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M2.5 4.5H13.5M6 2.5H10M5.5 4.5L6 13.5H10L10.5 4.5M6.7 7V11M9.3 7V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : role ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRemove(ws, role)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-pritio-coral/10 hover:text-pritio-coral disabled:opacity-50"
              >
                {deletingWs === ws.id ? "Saliendo..." : "Salir"}
              </button>
            ) : null}
          </span>
        </div>
      </div>
    );
  }

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
              <h2 className="truncate text-lg font-bold leading-snug text-ink">Facturación</h2>
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                Workspace activo:{" "}
                <span className="font-semibold text-ink-soft">
                  {currentWorkspace?.name ?? "Sin workspace"}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar facturación"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Pestañas principales */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex rounded-xl bg-surface-muted p-1">
              {(
                [
                  { value: "plans", label: "Planes" },
                  { value: "subscriptions", label: "Mis suscripciones" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setView(opt.value)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50",
                    view === opt.value
                      ? "bg-white text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles: moneda + periodo */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex rounded-xl bg-surface-muted p-1">
              {(["mxn", "usd"] as const).map((c) => (
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
            <div className="inline-flex rounded-xl bg-surface-muted p-1">
              {(
                [
                  { value: "monthly", label: "Mensual" },
                  { value: "yearly", label: `Anual · −${savingsPct}%` },
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
          </div>

          {view === "plans" ? (
            <>
              {/* Prueba */}
              {trialEndsAt && (
                <div className="mb-5 flex items-center gap-2 rounded-xl border border-pritio-blue/30 bg-pritio-blue/5 px-4 py-3 text-xs text-ink-soft">
                  <svg className="h-4 w-4 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5L13.5 4V8C13.5 11.5 11 14.5 8 15C5 14.5 2.5 11.5 2.5 8V4L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <path d="M5.5 8L7.2 9.7L10.8 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>
                    Prueba Pro activa en «{currentWorkspace?.name ?? "este workspace"}» hasta el{" "}
                    <span className="font-semibold text-ink">
                      {new Date(trialEndsAt).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    . Al terminar, el workspace vuelve a Gratis.
                  </span>
                </div>
              )}

              {/* Tabs por tipo */}
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                {TIERS.map((t) => {
                  const count = tierWorkspaces[t].length;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTier(t)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50",
                        tier === t
                          ? "bg-gradient-to-r from-pritio-purple to-pritio-blue text-white shadow-sm"
                          : "border border-line bg-surface text-ink-muted hover:text-ink",
                      )}
                    >
                      {TIER_NAMES[t]}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                          tier === t ? "bg-white/20 text-white" : "bg-surface-muted text-ink-muted",
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selector de workspace */}
              {tierWorkspaces[tier].length > 1 && (
                <div className="mb-4 flex flex-wrap justify-center gap-1.5">
                  {tierWorkspaces[tier].map((w) => {
                    const active = w.id === activeTierWs?.id;
                    const pro = effectivePlanForWorkspace(subscriptions, w.id) === "pro";
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setSelectedByTier((prev) => ({ ...prev, [tier]: w.id }))}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                          active
                            ? "border-pritio-blue/40 bg-pritio-blue/10 text-pritio-blue"
                            : "border-line bg-surface text-ink-muted hover:text-ink",
                        )}
                      >
                        <span className="max-w-[8rem] truncate">{w.name}</span>
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          pro ? "bg-pritio-blue/15 text-pritio-blue" : "bg-surface-muted text-ink-muted",
                        )}>
                          {pro ? "Pro" : "Free"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Free */}
                <div
                  className={cn(
                    "rounded-2xl border bg-surface p-5",
                    !activeIsPro ? "border-pritio-blue/40 ring-1 ring-pritio-blue/10" : "border-line",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-bold text-ink">Gratis</h4>
                    <span className="text-xl font-bold tracking-tight text-ink">$0</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Siempre gratis. Límites para este tipo de workspace.
                  </p>
                  <LimitList limits={getLimits("free", tier)} />
                  {activeTierWs && !activeIsPro && (
                    <p className="mt-3 text-[11px] font-semibold text-pritio-blue">
                      Plan actual de «{activeTierWs.name}»
                    </p>
                  )}
                </div>

                {/* Pro */}
                <div
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-surface p-5",
                    activeIsPro ? "border-pritio-blue/50 ring-1 ring-pritio-blue/20" : "border-line",
                  )}
                >
                  {!activeIsPro && activeCanPurchase && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-pritio-purple to-pritio-blue px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Recomendado
                    </span>
                  )}
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-sm font-bold text-ink">Pro</h4>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold tracking-tight text-ink">
                        {formatPrice(activePrice, currency)}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {activePerMember ? "/ miembro / mes" : "/ mes"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">{TIER_DESCRIPTIONS[tier]}</p>
                  <LimitList limits={getLimits("pro", tier)} highlight />

                  <div className="mt-auto space-y-2 pt-4">
                    {activePerMember && activeInfo && (
                      <p className="text-[11px] text-ink-muted">
                        <span className="font-semibold text-ink-soft">{activeMemberCount}</span>{" "}
                        {activeMemberCount === 1 ? "miembro" : "miembros"} en «{activeTierWs?.name ?? "tu workspace"}» →{" "}
                        <span className="font-semibold text-ink-soft">{formatPrice(activeTotal, currency)}/mes</span>
                      </p>
                    )}

                    {activeIsPro ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleManage()}
                          disabled={openingPortal}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                            <path d="M1.5 4.5L8 1.5L14.5 4.5V7C14.5 10.5 11.7 13.3 8 14.5C4.3 13.3 1.5 10.5 1.5 7V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                          </svg>
                          {openingPortal ? "Abriendo portal..." : "Administrar suscripción"}
                        </button>
                        {activeStatusLabel && (
                          <p className="text-center text-[11px] text-ink-muted">{activeStatusLabel}</p>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!activeCanPurchase || checkingOut === activeTierWs?.id}
                        onClick={() => activeTierWs && void handleChoose(activeTierWs, tier)}
                        className={cn(
                          "w-full rounded-xl px-3 py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed",
                          activeCanPurchase
                            ? "bg-gradient-to-r from-pritio-purple to-pritio-blue text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                            : "border border-line text-ink-muted disabled:opacity-60",
                        )}
                      >
                        {checkingOut === activeTierWs?.id
                          ? "Preparando..."
                          : !activeTierWs
                            ? `Crea un workspace ${TIER_NAMES[tier].toLowerCase()}`
                            : !activeInfo
                              ? "Cargando..."
                              : !activeInfo.canManage
                                ? "Solo el propietario gestiona el plan"
                                : `Activar Pro en «${activeTierWs.name}»`}
                      </button>
                    )}

                    {!activeTierWs && (
                      <p className="text-[11px] leading-relaxed text-ink-muted">
                        No tienes un workspace de tipo {TIER_NAMES[tier].toLowerCase()}. Créalo
                        desde el selector de workspaces para activar su plan Pro.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="mb-4 text-center text-xs text-ink-muted">
                Cada workspace tiene su propio plan: Gratis o Pro. Desde aquí puedes activar
                Pro, administrarlo o eliminar el workspace.
              </p>
              {workspaces.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  No tienes workspaces todavía.
                </p>
              ) : (
                <div className="space-y-3">{workspaces.map(renderRow)}</div>
              )}
            </>
          )}

          <p className="mt-6 text-center text-xs leading-relaxed text-ink-muted">
            Puedes cancelar en cualquier momento desde «Administrar suscripción». Si usas la
            prueba gratis, te avisaremos antes de que termine.
          </p>
          <p className="mt-2 text-center text-xs leading-relaxed text-ink-muted">
            Familiar y Equipo cobran por miembro; el cobro se ajusta solo al sumar o quitar
            miembros. Los pagos se procesan de forma segura con{" "}
            <span className="font-semibold text-ink-soft">Stripe</span>.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LimitList({ limits, highlight }: { limits: PlanLimits; highlight?: boolean }) {
  const rows = [
    { label: "Miembros", value: formatLimit(limits.memberLimit) },
    { label: "Tareas activas", value: formatLimit(limits.activeTaskLimit) },
    { label: "Eventos de agenda", value: formatLimit(limits.agendaEventLimit) },
    { label: "Proyectos", value: formatLimit(limits.projectLimit) },
    { label: "Responsables", value: formatLimit(limits.assigneeLimit) },
    { label: "Días bloqueados", value: formatLimit(limits.blockedDayLimit) },
    { label: "Juntas", value: limits.allowMeetings ? "Disponibles" : "Solo Pro" },
    { label: "Vistas Plan y Tablero", value: limits.allowPlanView ? "Disponibles" : "Solo Pro" },
  ];
  return (
    <ul className="mt-4 space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-muted">{r.label}</span>
          <span className={cn("font-semibold tabular-nums", highlight ? "text-pritio-blue" : "text-ink-soft")}>
            {r.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
