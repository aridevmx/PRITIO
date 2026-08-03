import { createPortal } from "react-dom";
import { DONATION_LINKS, IS_SELF_HOSTED } from "@/lib/constants";

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
}

const PLATFORMS = [
  {
    key: "github",
    name: "GitHub Sponsors",
    url: DONATION_LINKS.github,
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
  {
    key: "paypal",
    name: "PayPal",
    url: DONATION_LINKS.paypal,
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.076 21.337H2.47a.641.641 0 01-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
      </svg>
    ),
  },
  {
    key: "buymeacoffee",
    name: "Buy Me a Coffee",
    url: DONATION_LINKS.buymeacoffee,
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "stripe",
    name: "Stripe",
    url: DONATION_LINKS.stripe,
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 7.965 0 4.77 2.592 4.77 6.385c0 4.075 3.414 5.573 6.744 6.505 2.482.694 3.403 1.359 3.403 2.353 0 .997-.835 1.476-2.185 1.476-2.042 0-4.903-1.063-6.707-1.98l-.891 5.532c1.826.748 4.305 1.298 6.682 1.298 4.587 0 7.876-2.368 7.876-6.398 0-4.166-3.648-5.618-6.994-6.574z" />
      </svg>
    ),
  },
];

export function DonationModal({ open, onClose }: DonationModalProps) {
  if (!open || IS_SELF_HOSTED) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="prio-modal-enter mx-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ink">Apoyar este proyecto</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="mb-5 text-sm text-ink-muted">
          Priorify es de código abierto y gratuito. Si te es útil, considera donar para ayudarnos a mantener el servidor y que más gente pueda usarlo.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PLATFORMS.filter((p) => p.url).map((platform) => (
            <a
              key={platform.key}
              href={platform.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 rounded-xl border border-line p-4 text-ink hover:bg-surface-muted hover:border-line-strong transition-colors"
            >
              <div className="text-prio-purple">{platform.icon}</div>
              <span className="text-xs font-semibold text-center">{platform.name}</span>
            </a>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-muted text-center">
          Sin importar el monto, cada aportación ayuda.
        </p>
      </div>
    </div>,
    document.body,
  );
}
