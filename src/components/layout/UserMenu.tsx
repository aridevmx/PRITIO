import { useState, useRef, useEffect, type ReactNode } from "react";
import { useTheme } from "@/lib/useTheme";
import { IS_SELF_HOSTED } from "@/lib/constants";
import { DonationModal } from "@/components/layout/DonationModal";
import { AccountModal } from "@/features/account/AccountModal";
import type { Profile } from "@/types";

interface UserMenuProps {
  profile: Profile | null;
  onSignOut: () => void;
  children: ReactNode;
}

export function UserMenu({ profile, onSignOut, children }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { theme, toggleTheme } = useTheme();

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

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        aria-label="Abrir menú de usuario"
        aria-expanded={open}
        className="relative flex items-center gap-2 rounded-full"
      >
        {children}
        <svg
          className={`h-3.5 w-3.5 text-ink-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-4 top-14 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated prio-modal-enter"
        >
          {/* Header */}
          <div className="px-4 py-3">
            <p className="text-sm font-bold text-ink truncate">
              {profile?.fullName || "Usuario"}
            </p>
            <p className="text-xs text-ink-muted truncate">
              {profile?.email || ""}
            </p>
          </div>

          <div className="h-px bg-line" />

          {/* Mi cuenta */}
          <button
            onClick={() => { setOpen(false); setShowAccount(true); }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-muted transition-colors"
          >
            <svg className="h-4 w-4 text-ink-muted" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 14C3 11.2386 5.23858 9 8 9C10.7614 9 13 11.2386 13 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>Mi cuenta</span>
          </button>

          <div className="h-px bg-line" />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-surface-muted transition-colors"
          >
            {theme === "dark" ? (
              <svg className="h-4 w-4 text-amber-500" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 1V3M8 13V15M1 8H3M13 8H15M3.05 3.05L4.46 4.46M11.54 11.54L12.95 12.95M12.95 3.05L11.54 4.46M4.46 11.54L3.05 12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-indigo-500" viewBox="0 0 16 16" fill="none">
                <path d="M13.5 8.5C13.5 11.8137 10.8137 14.5 7.5 14.5C4.18629 14.5 1.5 11.8137 1.5 8.5C1.5 5.18629 4.18629 2.5 7.5 2.5C7.5 2.5 5.5 4.5 5.5 7C5.5 9.5 7.5 11.5 10 11.5C12 11.5 13.5 10 13.5 8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            )}
            <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </button>

          {!IS_SELF_HOSTED && (
            <>
              <div className="h-px bg-line" />
              <button
                onClick={() => { setOpen(false); setShowDonate(true); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-surface-muted transition-colors"
              >
                <svg className="h-4 w-4 text-red-400" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3C6.5 1 3 1.5 3 5C3 8.5 8 13 8 13C8 13 13 8.5 13 5C13 1.5 9.5 1 8 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <span>Donar / Apoyar</span>
              </button>
            </>
          )}

          <div className="h-px bg-line" />

          {/* Sign out */}
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095 2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6M10.6667 11.3333L14 8M14 8L10.6667 4.66667M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      )}

      <DonationModal open={showDonate} onClose={() => setShowDonate(false)} />
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
    </>
  );
}
