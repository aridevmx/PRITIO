import { useState, useRef, useEffect, type ReactNode } from "react";
import { useTheme } from "@/lib/useTheme";
import { IS_SELF_HOSTED } from "@/lib/constants";
import { DonationModal } from "@/components/layout/DonationModal";
import { ProfileEditModal } from "@/features/auth/ProfileEditModal";
import type { Profile } from "@/types";

interface UserMenuProps {
  profile: Profile | null;
  onSignOut: () => void;
  children: ReactNode;
}

export function UserMenu({ profile, onSignOut, children }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
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
        className="relative"
      >
        {children}
      </button>

      {open && (
        <>
          <div
            ref={menuRef}
            className="absolute right-4 top-14 z-50 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated prio-modal-enter"
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

            {/* Edit profile */}
            <button
              onClick={() => { setOpen(false); setShowProfileEdit(true); }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-surface-muted transition-colors"
            >
              <svg className="h-4 w-4 text-ink-muted" viewBox="0 0 16 16" fill="none">
                <path d="M11 2.5C11.3978 2.10217 11.9374 1.87868 12.5 1.87868C12.7761 1.87868 13.05 1.93254 13.305 2.03696C13.5599 2.14138 13.7906 2.294 13.9848 2.48528C14.179 2.67656 14.3343 2.90342 14.4411 3.15475C14.548 3.40608 14.604 3.67677 14.606 3.95286C14.608 4.22895 14.5561 4.50037 14.4532 4.753C14.3503 5.00564 14.1987 5.2344 14.0076 5.428L5.5 14L2 15L3 11.5L11 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Editar perfil</span>
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
                <path d="M6 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V3.33333C2 2.97971 2.14048 2.64057 2.39052 2.39052C2.64057 2.14048 2.97971 2 3.33333 2H6M10.6667 11.3333L14 8M14 8L10.6667 4.66667M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </>
      )}

      <DonationModal open={showDonate} onClose={() => setShowDonate(false)} />
      {showProfileEdit && (
        <ProfileEditModal onClose={() => setShowProfileEdit(false)} />
      )}
    </>
  );
}
