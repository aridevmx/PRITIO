import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/useTheme";
import { IS_SELF_HOSTED } from "@/lib/constants";
import { DonationModal } from "@/components/layout/DonationModal";
import { AccountModal, type TabId } from "@/features/account/AccountModal";
import { PreferencesModal } from "@/features/account/PreferencesModal";
import { SubscriptionsModal } from "@/features/billing/SubscriptionsModal";
import { ApprovalsDialog } from "@/features/tasks/ApprovalsDialog";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useBilling } from "@/features/billing/BillingProvider";
import { PLAN_LABELS, PLAN_BADGE_CLASSES } from "@/features/billing/plans";
import type { Profile } from "@/types";

interface UserMenuProps {
  profile: Profile | null;
  onSignOut: () => void;
  children: ReactNode;
}

export function UserMenu({ profile, onSignOut, children }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<TabId | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { isLeader, currentWorkspace } = useWorkspace();
  const { effectivePlan } = useBilling();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const initial = (profile?.fullName || profile?.email || "?").charAt(0).toUpperCase();

  const openAccount = (tab: TabId) => {
    setOpen(false);
    setAccountTab(tab);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        aria-label="Abrir menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        className="group flex items-center gap-1.5 rounded-full p-1 pr-2 transition-colors hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
      >
        {children}
        <svg
          className={cn(
            "h-3.5 w-3.5 text-ink-muted transition-transform duration-200 group-hover:text-ink-soft",
            open && "rotate-180",
          )}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Menú de usuario"
          className="pritio-menu-enter absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-elevated"
        >
          {/* Identidad */}
          <div className="relative overflow-hidden px-4 pt-4 pb-3">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-pritio-purple/10 via-transparent to-transparent" aria-hidden />
            <div className="relative flex items-center gap-3">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-line/70"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pritio-purple to-pritio-blue text-sm font-bold text-white shadow-sm">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  {profile?.fullName || "Usuario"}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {profile?.email || ""}
                </p>
              </div>
            </div>
            <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowSubscriptions(true);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80",
                  PLAN_BADGE_CLASSES[effectivePlan],
                )}
              >
                {PLAN_LABELS[effectivePlan]}
                <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none">
                  <path d="M6 11L10 8L6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className="h-px bg-line" />

          {/* Cuenta y ajustes */}
          <div className="p-1.5">
            <MenuItem
              icon={
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3 14C3 11.2386 5.23858 9 8 9C10.7614 9 13 11.2386 13 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              label="Mi cuenta"
              onClick={() => openAccount("identity")}
            />
            <MenuItem
              icon={
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="1.8" fill="currentColor" />
                  <path d="M8 2.5V4M8 12V13.5M2.5 8H4M12 8H13.5M4.2 4.2L5.3 5.3M10.7 10.7L11.8 11.8M11.8 4.2L10.7 5.3M5.3 10.7L4.2 11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              label="Preferencias"
              onClick={() => {
                setOpen(false);
                setShowPreferences(true);
              }}
            />
            <MenuItem
              icon={
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M2.5 4.5H13.5V12.5H2.5V4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M5.5 4.5V3.5C5.5 2.7 6.2 2 7 2H9C9.8 2 10.5 2.7 10.5 3.5V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              label="Mis suscripciones"
              onClick={() => {
                setOpen(false);
                setShowSubscriptions(true);
              }}
            />
          </div>

          <div className="h-px bg-line/70" />

          {/* Equipo */}
          <div className="p-1.5">
            <MenuItem
              icon={
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <rect x="2.5" y="4.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M5.5 4.5V3.5C5.5 2.7 6.2 2 7 2H8C8.8 2 9.5 2.7 9.5 3.5V4.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              }
              label="Mis días bloqueados"
              onClick={() => openAccount("blockedDays")}
            />
            <MenuItem
              icon={
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3V6.5M8 9.5V12.5M5.5 5.5V9M10.5 5.5V9M2.5 14H13.5M4 12.5V3.5C4 2.7 4.7 2 5.5 2H10.5C11.3 2 12 2.7 12 3.5V12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
              label="Notificaciones"
              onClick={() => openAccount("notifications")}
            />
            {isLeader && (
              <MenuItem
                icon={
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5L14 13.5H2L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M8 6V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <circle cx="8" cy="11.3" r="0.8" fill="currentColor" />
                  </svg>
                }
                label="Aprobaciones"
                onClick={() => {
                  setOpen(false);
                  setShowApprovals(true);
                }}
              />
            )}
          </div>

          <div className="h-px bg-line/70" />

          {/* Apariencia */}
          <div className="p-1.5">
            <MenuItem
              icon={
                theme === "dark" ? (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 1V3M8 13V15M1 8H3M13 8H15M3.05 3.05L4.46 4.46M11.54 11.54L12.95 12.95M12.95 3.05L11.54 4.46M4.46 11.54L3.05 12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 8.5C13.5 11.8137 10.8137 14.5 7.5 14.5C4.18629 14.5 1.5 11.8137 1.5 8.5C1.5 5.18629 4.18629 2.5 7.5 2.5C7.5 2.5 5.5 4.5 5.5 7C5.5 9.5 7.5 11.5 10 11.5C12 11.5 13.5 10 13.5 8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                )
              }
              label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
              onClick={toggleTheme}
            />
          </div>

          {!IS_SELF_HOSTED && (
            <>
              <div className="h-px bg-line/70" />
              <div className="p-1.5">
                <MenuItem
                  icon={
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3C6.5 1 3 1.5 3 5C3 8.5 8 13 8 13C8 13 13 8.5 13 5C13 1.5 9.5 1 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  }
                  label="Donar / Apoyar"
                  onClick={() => {
                    setOpen(false);
                    setShowDonate(true);
                  }}
                />
              </div>
            </>
          )}

          <div className="h-px bg-line/70" />

          {/* Cerrar sesión */}
          <div className="p-1.5">
            <MenuItem
              danger
              icon={
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095 2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6M10.6667 11.3333L14 8M14 8L10.6667 4.66667M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              label="Cerrar sesión"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            />
          </div>
        </div>
      )}

      <DonationModal open={showDonate} onClose={() => setShowDonate(false)} />
      {showPreferences && <PreferencesModal onClose={() => setShowPreferences(false)} />}
      {showSubscriptions && <SubscriptionsModal onClose={() => setShowSubscriptions(false)} />}
      {accountTab && (
        <AccountModal
          initialTab={accountTab}
          onClose={() => setAccountTab(null)}
        />
      )}
      <ApprovalsDialog
        open={showApprovals}
        workspaceId={currentWorkspace?.id ?? null}
        onClose={() => setShowApprovals(false)}
      />
    </div>
  );
}

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, onClick, danger }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/40",
        danger
          ? "text-pritio-coral hover:bg-pritio-coral/10"
          : "text-ink hover:bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center",
          danger ? "text-pritio-coral/80" : "text-ink-muted",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
