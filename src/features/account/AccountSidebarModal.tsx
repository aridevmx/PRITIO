import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { IdentityTab } from "@/features/account/IdentityTab";
import { SecurityTab } from "@/features/account/SecurityTab";
import { PreferencesTab } from "@/features/account/PreferencesTab";
import { BlockedDaysTab } from "@/features/account/BlockedDaysTab";
import { NotificationsTab } from "@/features/account/NotificationsTab";
import { IntegrationsTab } from "@/features/account/IntegrationsTab";
import { AboutTab } from "@/features/account/AboutTab";
import { useBilling } from "@/features/billing/BillingProvider";
import { PLAN_LABELS, PLAN_BADGE_CLASSES } from "@/features/billing/plans";
import { AppIcon } from "@/components/AppIcon";
import { X, ChevronRight } from "@phosphor-icons/react";

export type TabId =
  | "identity"
  | "security"
  | "preferences"
  | "blockedDays"
  | "notifications"
  | "integrations"
  | "about";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "identity", label: "Identidad", icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 14.5c0-3.5 3.5-5.5 6-5.5s6 2 6 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: "security", label: "Seguridad", icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M8 2a4 4 0 00-4 4v6.5a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V6a4 4 0 00-4-4ZM8 4a2 2 0 110 4 2 2 0 010-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "preferences", label: "Preferencias", icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: "blockedDays", label: "Mis días", icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M3 4h10a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1Z" stroke="currentColor" strokeWidth="1.5"/><path d="M3 8h10" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3" stroke="currentColor" strokeWidth="1.5"/></svg> },
  { id: "notifications", label: "Notificaciones", icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M8 2a5 5 0 015 5v1h1a1 1 0 011 1v1a1 1 0 01-1 1H2a1 1 0 01-1-1v-1a1 1 0 011-1h1V7a5 5 0 015-5Z" stroke="currentColor" strokeWidth="1.5"/><path d="M8 12v2M8 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: "integrations", label: "Integraciones", icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M4 8h3M13 8h-3M8 4v3M8 13v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: "about", label: "Acerca de", icon: <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
];

export function AccountSidebarModal({ onClose, initialTab }: { onClose: () => void; initialTab?: TabId }) {
  const { profile, signOut } = useAuth();
  const { effectivePlan } = useBilling();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? "identity");
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    identity: null,
    security: null,
    preferences: null,
    blockedDays: null,
    notifications: null,
    integrations: null,
    about: null,
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  function handleTabKeyDown(e: React.KeyboardEvent) {
    const tabIds = TABS.map((t) => t.id);
    const idx = tabIds.indexOf(activeTab);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = tabIds[(idx + dir + tabIds.length) % tabIds.length];
      setActiveTab(next);
      tabRefs.current[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const target = e.key === "Home" ? tabIds[0] : tabIds[tabIds.length - 1];
      setActiveTab(target);
      tabRefs.current[target]?.focus();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
    >
      <div className="pritio-modal-enter flex max-h-[90vh] w-full max-w-4xl rounded-2xl border border-line bg-surface shadow-elevated overflow-hidden">
        {/* Sidebar navigation */}
        <aside
          className={cn(
            "flex flex-col w-56 min-w-56 border-r border-line bg-surface/50 hidden lg:flex",
            mobileSidebarOpen && "lg:hidden fixed inset-y-0 left-0 z-50"
          )}
          aria-label="Navegación de cuenta"
        >
          {/* Header */}
          <div className="flex flex-col p-4 border-b border-line">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pritio-purple to-pritio-blue text-lg font-bold text-white">
                {(profile?.fullName || profile?.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="account-modal-title" className="truncate text-lg font-bold leading-snug text-ink">
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
            </div>
          </div>

          {/* Navigation tabs */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-1" role="tablist" aria-label="Secciones de configuración">
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
                onClick={() => {
                  setActiveTab(tab.id);
                  setMobileSidebarOpen(false);
                }}
                onKeyDown={handleTabKeyDown}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50",
                  activeTab === tab.id
                    ? "bg-pritio-blue/10 text-ink"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted" aria-hidden>
                  {tab.icon}
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            ))}

            {/* Plan shortcut */}
            <div className="border-t border-line my-2" />
            <button
              type="button"
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent("pritio:open-subscriptions"));
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600" aria-hidden>
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="4" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="truncate">Plan y facturación</span>
              <AppIcon glyph={ChevronRight} className="ml-auto text-ink-muted" />
            </button>
          </nav>

          {/* Footer - Sign out */}
          <div className="p-2 border-t border-line">
            <button
              type="button"
              onClick={() => {
                signOut();
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-pritio-coral transition-colors hover:bg-pritio-coral/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-coral/40"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pritio-coral/10 text-pritio-coral" aria-hidden>
                <AppIcon glyph={X} size="sm" />
              </span>
              <span className="truncate">Cerrar sesión</span>
            </button>
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-ink/30 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Content area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Mobile header with close and menu button */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-line">
            <h2 className="text-lg font-bold text-ink">Mi cuenta</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Abrir menú"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted"
              >
                <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              <button
                onClick={onClose}
                aria-label="Cerrar configuración"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <AppIcon glyph={X} />
              </button>
            </div>
          </div>

          {/* Tab panels */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <section
              role="tabpanel"
              id="account-panel-identity"
              aria-labelledby="account-tab-identity"
              hidden={activeTab !== "identity"}
              className="space-y-7 animate-in fade-in duration-150"
            >
              {activeTab === "identity" && <IdentityTab />}
            </section>
            <section
              role="tabpanel"
              id="account-panel-security"
              aria-labelledby="account-tab-security"
              hidden={activeTab !== "security"}
              className="space-y-7 animate-in fade-in duration-150"
            >
              {activeTab === "security" && <SecurityTab />}
            </section>
            <section
              role="tabpanel"
              id="account-panel-preferences"
              aria-labelledby="account-tab-preferences"
              hidden={activeTab !== "preferences"}
              className="space-y-7 animate-in fade-in duration-150"
            >
              {activeTab === "preferences" && <PreferencesTab />}
            </section>
            <section
              role="tabpanel"
              id="account-panel-blockedDays"
              aria-labelledby="account-tab-blockedDays"
              hidden={activeTab !== "blockedDays"}
              className="space-y-7 animate-in fade-in duration-150"
            >
              {activeTab === "blockedDays" && <BlockedDaysTab />}
            </section>
            <section
              role="tabpanel"
              id="account-panel-notifications"
              aria-labelledby="account-tab-notifications"
              hidden={activeTab !== "notifications"}
              className="space-y-7 animate-in fade-in duration-150"
            >
              {activeTab === "notifications" && <NotificationsTab />}
            </section>
            <section
              role="tabpanel"
              id="account-panel-integrations"
              aria-labelledby="account-tab-integrations"
              hidden={activeTab !== "integrations"}
              className="space-y-7 animate-in fade-in duration-150"
            >
              {activeTab === "integrations" && <IntegrationsTab />}
            </section>
            <section
              role="tabpanel"
              id="account-panel-about"
              aria-labelledby="account-tab-about"
              hidden={activeTab !== "about"}
              className="space-y-7 animate-in fade-in duration-150"
            >
              {activeTab === "about" && <AboutTab />}
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}