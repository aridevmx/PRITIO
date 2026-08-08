import { createPortal } from "react-dom";
import { PreferencesTab } from "@/features/account/PreferencesTab";
import { useAuth } from "@/features/auth/AuthProvider";

interface PreferencesModalProps {
  onClose: () => void;
}

export function PreferencesModal({ onClose }: PreferencesModalProps) {
  const { profile } = useAuth();

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter mx-4 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
        <div className="border-b border-line px-6 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pritio-purple to-pritio-blue text-lg font-bold text-white">
              <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="1.8" fill="currentColor" />
                <path d="M8 3V4M8 12V13M3 8H4M12 8H13M4.5 4.5L5.2 5.2M10.8 10.8L11.5 11.5M11.5 4.5L10.8 5.2M5.2 10.8L4.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold leading-snug text-ink">
                Preferencias
              </h2>
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                {profile?.email}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar Preferencias"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <PreferencesTab />
        </div>
      </div>
    </div>,
    document.body,
  );
}
