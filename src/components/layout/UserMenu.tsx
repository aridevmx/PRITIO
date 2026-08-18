import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { emitAppEvent } from "@/lib/appEvents";
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
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const { theme, toggleTheme } = useTheme();
  const { isLeader, currentWorkspace } = useWorkspace();
  const { effectivePlan } = useBilling();

  const initial = (profile?.fullName || profile?.email || "?").charAt(0).toUpperCase();

  const openAccount = (tab: TabId) => {
    setOpen(false);
    setAccountTab(tab);
  };

  const close = useCallback(() => setOpen(false), []);

  // ── Focus trap + keyboard navigation ────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btnRef.current?.focus();
        return;
      }

      const items = itemsRef.current.filter(Boolean) as HTMLButtonElement[];
      const idx = items.indexOf(document.activeElement as HTMLButtonElement);
      if (idx === -1) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (idx + 1) % items.length;
        items[next]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = (idx - 1 + items.length) % items.length;
        items[prev]?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      } else if (e.key === "Tab") {
        close();
      }
    },
    [close],
  );

  // ── Open/close lifecycle ────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Auto-focus first item
    requestAnimationFrame(() => {
      itemsRef.current[0]?.focus();
    });
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close, handleKeyDown]);

  // Reset item refs when menu closes
  useEffect(() => {
    if (!open) itemsRef.current = [];
  }, [open]);

  // ── Helpers ─────────────────────────────────────────────────
  const registerItem = (idx: number) => (el: HTMLButtonElement | null) => {
    itemsRef.current[idx] = el;
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir menú de usuario"
        aria-haspopup="menu"
        aria-expanded={open}
        className="group flex items-center gap-1.5 rounded-full p-1 pr-2 transition-colors hover:bg-surface-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
        data-tour="menu"
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
          className="pritio-menu-enter absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-elevated"
        >
          {/* ── Identidad ────────────────────────────────────── */}
          <div className="relative overflow-hidden px-3.5 pt-3.5 pb-2.5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-br from-pritio-purple/10 via-transparent to-transparent" aria-hidden />
            <div className="relative flex items-center gap-2.5">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-line/70"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pritio-purple to-pritio-blue text-sm font-bold text-white shadow-sm">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  {profile?.fullName || "Usuario"}
                </p>
                <p className="truncate text-[11px] leading-tight text-ink-muted">
                  {profile?.email || ""}
                </p>
              </div>
            </div>
            <div className="relative mt-2.5">
              <button
                type="button"
                onClick={() => {
                  close();
                  setShowSubscriptions(true);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80",
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

          <div className="h-px bg-line/60" />

          {/* ── Cuenta ──────────────────────────────────────── */}
          <div className="p-1" role="group" aria-label="Cuenta">
            <MenuItem
              ref={registerItem(0)}
              icon={<UserIcon />}
              label="Mi cuenta"
              onClick={() => openAccount("identity")}
            />
            <MenuItem
              ref={registerItem(1)}
              icon={<WalletIcon />}
              label="Suscripciones"
              onClick={() => {
                close();
                setShowSubscriptions(true);
              }}
            />
          </div>

          <div className="h-px bg-line/40" />

          {/* ── Workspace ────────────────────────────────────── */}
          <div className="p-1" role="group" aria-label="Workspace">
            <MenuItem
              ref={registerItem(2)}
              icon={<CalendarOffIcon />}
              label="Mis días bloqueados"
              onClick={() => openAccount("blockedDays")}
            />
            <MenuItem
              ref={registerItem(3)}
              icon={<BellIcon />}
              label="Notificaciones"
              onClick={() => openAccount("notifications")}
            />
            {isLeader && (
              <MenuItem
                ref={registerItem(4)}
                icon={<ShieldIcon />}
                label="Aprobaciones"
                onClick={() => {
                  close();
                  setShowApprovals(true);
                }}
              />
            )}
          </div>

          <div className="h-px bg-line/40" />

          {/* ── Preferencias ─────────────────────────────────── */}
          <div className="p-1" role="group" aria-label="Preferencias">
            <MenuItem
              ref={registerItem(isLeader ? 5 : 4)}
              icon={<SlidersIcon />}
              label="Preferencias"
              onClick={() => {
                close();
                setShowPreferences(true);
              }}
            />
            <MenuItem
              ref={registerItem(isLeader ? 6 : 5)}
              icon={theme === "dark" ? <SunIcon /> : <MoonIcon />}
              label={theme === "dark" ? "Modo claro" : "Modo oscuro"}
              onClick={toggleTheme}
            />
          </div>

          <div className="h-px bg-line/40" />

          {/* ── Ayuda ────────────────────────────────────────── */}
          <div className="p-1" role="group" aria-label="Ayuda">
            <MenuItem
              ref={registerItem(isLeader ? 7 : 6)}
              icon={<StarIcon />}
              label="Tour de la app"
              onClick={() => {
                close();
                emitAppEvent("pritio:startTour");
              }}
            />
            {!IS_SELF_HOSTED && (
              <MenuItem
                ref={registerItem(isLeader ? 8 : 7)}
                icon={<HeartIcon />}
                label="Donar / Apoyar"
                onClick={() => {
                  close();
                  setShowDonate(true);
                }}
              />
            )}
          </div>

          {/* ── Cerrar sesión (separado visualmente) ─────────── */}
          <div className="border-t border-line/60 p-1">
            <MenuItem
              ref={registerItem(isLeader ? 9 : 8)}
              danger
              icon={<SignOutIcon />}
              label="Cerrar sesión"
              onClick={() => {
                close();
                onSignOut();
              }}
            />
          </div>
        </div>
      )}

      {/* ── Modales ──────────────────────────────────────────── */}
      <DonationModal open={showDonate} onClose={() => setShowDonate(false)} />
      {showPreferences && <PreferencesModal onClose={() => setShowPreferences(false)} />}
      {showSubscriptions && <SubscriptionsModal onClose={() => setShowSubscriptions(false)} />}
      {accountTab && (
        <AccountModal initialTab={accountTab} onClose={() => setAccountTab(null)} />
      )}
      <ApprovalsDialog
        open={showApprovals}
        workspaceId={currentWorkspace?.id ?? null}
        onClose={() => setShowApprovals(false)}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*  Icons (consistent 16×16, stroke 1.5, rounded caps)         */
/* ──────────────────────────────────────────────────────────── */

function UserIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 14C3 11.2386 5.23858 9 8 9C10.7614 9 13 11.2386 13 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 4.5H13.5V12.5H2.5V4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5.5 4.5V3.5C5.5 2.7 6.2 2 7 2H9C9.8 2 10.5 2.7 10.5 3.5V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CalendarOffIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="4.5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 4.5V3.5C5.5 2.7 6.2 2 7 2H8C8.8 2 9.5 2.7 9.5 3.5V4.5M2.5 8H13.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 3V6.5M8 9.5V12.5M5.5 5.5V9M10.5 5.5V9M2.5 14H13.5M4 12.5V3.5C4 2.7 4.7 2 5.5 2H10.5C11.3 2 12 2.7 12 3.5V12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L14 13.5H2L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.3" r="0.8" fill="currentColor" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
      <path d="M8 2.5V4M8 12V13.5M2.5 8H4M12 8H13.5M4.2 4.2L5.3 5.3M10.7 10.7L11.8 11.8M11.8 4.2L10.7 5.3M5.3 10.7L4.2 11.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 8.5C13.5 11.8137 10.8137 14.5 7.5 14.5C4.18629 14.5 1.5 11.8137 1.5 8.5C1.5 5.18629 4.18629 2.5 7.5 2.5C7.5 2.5 5.5 4.5 5.5 7C5.5 9.5 7.5 11.5 10 11.5C12 11.5 13.5 10 13.5 8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1V3M8 13V15M1 8H3M13 8H15M3.05 3.05L4.46 4.46M11.54 11.54L12.95 12.95M12.95 3.05L11.54 4.46M4.46 11.54L3.05 12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L9.2 5.4L13 5.4L10 7.6L11.1 11.5L8 9.3L4.9 11.5L6 7.6L3 5.4L6.8 5.4L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M8 3C6.5 1 3 1.5 3 5C3 8.5 8 13 8 13C8 13 13 8.5 13 5C13 1.5 9.5 1 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095 2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6M10.6667 11.3333L14 8M14 8L10.6667 4.66667M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*  MenuItem — roving tabindex via forwarded ref                */
/* ──────────────────────────────────────────────────────────── */

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { icon, label, onClick, danger },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      tabIndex={0}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pritio-purple/50",
        "active:scale-[0.98]",
        danger
          ? "text-pritio-coral hover:bg-pritio-coral/10 focus-visible:ring-pritio-coral/40"
          : "text-ink hover:bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center",
          danger ? "text-pritio-coral/70" : "text-ink-muted",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
});
