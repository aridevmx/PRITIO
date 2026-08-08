import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { IdentityTab } from "@/features/account/IdentityTab";
import { SecurityTab } from "@/features/account/SecurityTab";
import { BlockedDaysTab } from "@/features/account/BlockedDaysTab";
import { NotificationsTab } from "@/features/account/NotificationsTab";
import { AboutTab } from "@/features/account/AboutTab";
import { useBilling } from "@/features/billing/BillingProvider";
import { PLAN_LABELS, PLAN_BADGE_CLASSES } from "@/features/billing/plans";

interface AccountModalProps {
  onClose: () => void;
  initialTab?: TabId;
}

export type TabId =
  | "identity"
  | "security"
  | "blockedDays"
  | "notifications"
  | "about";

const TABS: { id: TabId; label: string }[] = [
  { id: "identity", label: "Identidad" },
  { id: "security", label: "Seguridad" },
  { id: "blockedDays", label: "Mis días" },
  { id: "notifications", label: "Notificaciones" },
  { id: "about", label: "Acerca de" },
];

export function AccountModal({ onClose, initialTab }: AccountModalProps) {
  const { profile, signOut } = useAuth();
  const { effectivePlan } = useBilling();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? "identity");
  const tabIds = TABS.map((t) => t.id);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    identity: null,
    security: null,
    blockedDays: null,
    notifications: null,
    about: null,
  });

  function handleTabKeyDown(e: React.KeyboardEvent) {
    const idx = tabIds.indexOf(activeTab);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = tabIds[(idx + dir + tabIds.length) % tabIds.length];
      setActiveTab(next);
      tabRefs.current[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const target = e.key === "Home" ? tabIds[0] : tabIds[tabIds.length - 1];
      setActiveTab(target);
      tabRefs.current[target]?.focus();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
        {/* Header: identidad del usuario */}
        <div className="border-b border-line px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pritio-purple to-pritio-blue text-lg font-bold text-white">
              {(profile?.fullName || profile?.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold leading-snug text-ink">
                Mi cuenta
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="truncate text-xs text-ink-muted">{profile?.email}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    PLAN_BADGE_CLASSES[effectivePlan],
                  )}
                >
                  {PLAN_LABELS[effectivePlan]}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar Mi cuenta"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-line px-6 pt-3 pb-3">
          <div
            role="tablist"
            aria-label="Secciones de mi cuenta"
            onKeyDown={handleTabKeyDown}
            className="flex gap-1 overflow-x-auto rounded-xl bg-surface-muted p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`account-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`account-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                ref={(el) => { tabRefs.current[tab.id] = el; }}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50",
                  activeTab === tab.id
                    ? "bg-white text-ink shadow-sm"
                    : "text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido por tab */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <section
            role="tabpanel"
            id="account-panel-identity"
            aria-labelledby="account-tab-identity"
            hidden={activeTab !== "identity"}
            className="space-y-7"
          >
            {activeTab === "identity" && <IdentityTab />}
          </section>
          <section
            role="tabpanel"
            id="account-panel-security"
            aria-labelledby="account-tab-security"
            hidden={activeTab !== "security"}
            className="space-y-7"
          >
            {activeTab === "security" && <SecurityTab />}
          </section>
          <section
            role="tabpanel"
            id="account-panel-blockedDays"
            aria-labelledby="account-tab-blockedDays"
            hidden={activeTab !== "blockedDays"}
            className="space-y-7"
          >
            {activeTab === "blockedDays" && <BlockedDaysTab />}
          </section>
          <section
            role="tabpanel"
            id="account-panel-notifications"
            aria-labelledby="account-tab-notifications"
            hidden={activeTab !== "notifications"}
            className="space-y-7"
          >
            {activeTab === "notifications" && <NotificationsTab />}
          </section>
          <section
            role="tabpanel"
            id="account-panel-about"
            aria-labelledby="account-tab-about"
            hidden={activeTab !== "about"}
            className="space-y-7"
          >
            {activeTab === "about" && <AboutTab />}
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-line px-6 py-3">
          <button
            onClick={() => void signOut()}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-pritio-coral hover:bg-pritio-coral/10 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
