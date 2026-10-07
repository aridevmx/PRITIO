import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/lib/useTheme";
import { IS_SELF_HOSTED, SHOW_DONATIONS } from "@/lib/constants";
import { DonationModal } from "@/components/layout/DonationModal";
import { AccountSidebarModal, type TabId } from "@/features/account/AccountSidebarModal";
import { SubscriptionsModal } from "@/features/billing/SubscriptionsModal";
import { ApprovalsDialog } from "@/features/tasks/ApprovalsDialog";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useBilling } from "@/features/billing/BillingProvider";
import { PLAN_LABELS, PLAN_BADGE_CLASSES } from "@/features/billing/plans";
import { AppIcon } from "@/components/AppIcon";
import {
  Bell,
  CalendarCheck,
  CaretDown,
  CaretRight,
  Desktop,
  Heart,
  Moon,
  ShieldCheck,
  SignOut,
  Star,
  Sun,
  User,
  Wallet,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { emitAppEvent } from "@/lib/appEvents";
import type { Profile } from "@/types";

interface UserMenuProps {
  profile: Profile | null;
  onSignOut: () => void;
  children: ReactNode;
}

const THEME_LABELS: Record<Theme, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
};

export function UserMenu({ profile, onSignOut, children }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<TabId | null>(null);
  const [showSubscriptions, setShowSubscriptions] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const { theme, setTheme } = useTheme();
  const { isLeader, currentWorkspace } = useWorkspace();
  const { effectivePlan } = useBilling();

  const initial = (profile?.fullName || profile?.email || "?").charAt(0).toUpperCase();

  const accountIndex = 0;
  const billingIndex = 1;
  const availabilityIndex = 2;
  const approvalsIndex = isLeader ? 3 : -1;
  const notificationsIndex = isLeader ? 4 : 3;
  const themeIndex = isLeader ? 5 : 4;
  const tourIndex = isLeader ? 6 : 5;
  const supportIndex = SHOW_DONATIONS && !IS_SELF_HOSTED ? (isLeader ? 7 : 6) : -1;
  const signOutIndex = SHOW_DONATIONS && !IS_SELF_HOSTED ? (isLeader ? 8 : 7) : (isLeader ? 7 : 6);

  const openAccount = (tab: TabId) => {
    setOpen(false);
    setAccountTab(tab);
  };

  const close = useCallback(() => setOpen(false), []);

  const cycleTheme = useCallback(() => {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  }, [theme, setTheme]);

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

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      itemsRef.current[0]?.focus();
    });
    const handleClick = (e: MouseEvent) => {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        (e.target as HTMLElement).closest("[data-user-menu]") === null
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

  useEffect(() => {
    if (!open) itemsRef.current = [];
  }, [open]);

  // Handle subscriptions modal open from AccountSidebarModal
  useEffect(() => {
    const handler = () => {
      setShowSubscriptions(true);
    };
    window.addEventListener("pritio:open-subscriptions", handler);
    return () => window.removeEventListener("pritio:open-subscriptions", handler);
  }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;

    const updatePosition = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const menuWidth = 256; // w-64 = 256px
      const viewportWidth = window.innerWidth;
      const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 16);
      setMenuPosition({
        top: rect.bottom + 8, // mt-2 = 8px
        left: Math.max(left, 16),
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const registerItem = (idx: number) => (el: HTMLButtonElement | null) => {
    if (idx >= 0) itemsRef.current[idx] = el;
  };

  const themeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Desktop;

  const menuContent = (
    <div
      data-user-menu
      className="pritio-menu-enter z-[100] w-64 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-elevated"
      role="menu"
      aria-label="Menú de usuario"
      style={{
        position: "fixed",
        top: menuPosition?.top ?? 0,
        left: menuPosition?.left ?? 0,
        width: menuPosition?.width ?? 256,
      }}
    >
      <div className="relative overflow-hidden px-3.5 pt-3.5 pb-2.5">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-br from-pritio-purple/10 via-transparent to-transparent"
          aria-hidden
        />
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
            aria-label="Gestionar plan y facturación"
            className={cn(
              "inline-flex min-h-[28px] items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80",
              PLAN_BADGE_CLASSES[effectivePlan],
            )}
          >
            Plan {PLAN_LABELS[effectivePlan]}
            <AppIcon glyph={CaretRight} size="xs" />
          </button>
        </div>
      </div>

      <div className="h-px bg-line/60" />

      <div className="p-1" role="group" aria-label="Cuenta">
        <MenuItem
          ref={registerItem(accountIndex)}
          icon={User}
          label="Mi cuenta"
          onClick={() => openAccount("identity")}
        />
        <MenuItem
          ref={registerItem(billingIndex)}
          icon={Wallet}
          label="Suscripción y facturación"
          onClick={() => {
            close();
            setShowSubscriptions(true);
          }}
        />
      </div>

      <div className="h-px bg-line/40" />

      <div className="p-1" role="group" aria-label="Gestión">
        <MenuItem
          ref={registerItem(availabilityIndex)}
          icon={CalendarCheck}
          label="Disponibilidad"
          onClick={() => openAccount("blockedDays")}
        />
        {isLeader && (
          <MenuItem
            ref={registerItem(approvalsIndex)}
            icon={ShieldCheck}
            label="Aprobaciones"
            onClick={() => {
              close();
              setShowApprovals(true);
            }}
          />
        )}
      </div>

      <div className="h-px bg-line/40" />

      <div className="p-1" role="group" aria-label="Preferencias">
        <MenuItem
          ref={registerItem(notificationsIndex)}
          icon={Bell}
          label="Notificaciones"
          onClick={() => openAccount("notifications")}
        />
        <MenuItem
          ref={registerItem(themeIndex)}
          icon={themeIcon}
          label={`Tema: ${THEME_LABELS[theme]}`}
          onClick={cycleTheme}
        />
      </div>

      <div className="h-px bg-line/40" />

      <div className="p-1" role="group" aria-label="Ayuda y apoyo">
        <MenuItem
          ref={registerItem(tourIndex)}
          icon={Star}
          label="Ver recorrido de la app"
          onClick={() => {
            close();
            emitAppEvent("pritio:startTour");
          }}
        />
        {SHOW_DONATIONS && !IS_SELF_HOSTED && (
          <MenuItem
            ref={registerItem(supportIndex)}
            icon={Heart}
            label="Apoyar el proyecto"
            onClick={() => {
              close();
              setShowDonate(true);
            }}
          />
        )}
      </div>

      <div className="border-t border-line/60 p-1">
        <MenuItem
          ref={registerItem(signOutIndex)}
          danger
          icon={SignOut}
          label="Cerrar sesión"
          onClick={() => {
            close();
            onSignOut();
          }}
        />
      </div>
    </div>
  );

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
        <AppIcon
          glyph={CaretDown}
          size="sm"
          className={cn(
            "text-ink-muted transition-transform duration-200 group-hover:text-ink-soft",
            open && "rotate-180",
          )}
        />
      </button>

      {open && menuPosition && createPortal(menuContent, document.body)}

      <DonationModal open={showDonate} onClose={() => setShowDonate(false)} />
      {showSubscriptions && <SubscriptionsModal onClose={() => setShowSubscriptions(false)} />}
      {accountTab && (
        <AccountSidebarModal initialTab={accountTab} onClose={() => setAccountTab(null)} />
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
  icon: PhosphorIcon;
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
        "flex w-full min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors",
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
        <AppIcon glyph={icon} />
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
});