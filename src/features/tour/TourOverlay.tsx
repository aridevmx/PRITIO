import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { TOUR_STEPS } from "./tourSteps";

const TOUR_DONE_KEY = "pritio:tourDone";

export function hasTourBeenSeen(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(TOUR_DONE_KEY) === "true";
}

export function markTourSeen(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TOUR_DONE_KEY, "true");
}

interface TourOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTargetRect(selector: string | undefined): TargetRect | null {
  if (!selector) return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const el of els) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }
  }
  return null;
}

export function TourOverlay({ open, onClose }: TourOverlayProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const total = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];

  const updateRect = useCallback(() => {
    setRect(findTargetRect(current.target));
  }, [current.target]);

  useEffect(() => {
    if (!open) return;
    updateRect();
    const onScroll = () => {
      requestAnimationFrame(updateRect);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markTourSeen();
        onClose();
      }
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, total - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, total]);

  useEffect(() => {
    setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const isLast = step === total - 1;
  const isFirst = step === 0;

  const cardStyle: React.CSSProperties = rect
    ? { top: Math.max(16, rect.top + rect.height + 16) }
    : {};

  const finish = () => {
    markTourSeen();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Tour de la app">
      {/* Spotlight */}
      {rect && (
        <div
          className="pointer-events-none fixed rounded-xl ring-4 ring-pritio-purple/80 transition-all duration-200"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      )}

      {/* Card */}
      <div
        className={cn(
          "fixed left-1/2 z-[81] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-line bg-surface p-5 shadow-elevated",
          rect ? "" : "top-1/2 -translate-y-1/2",
        )}
        style={rect ? cardStyle : undefined}
      >
        <button
          type="button"
          onClick={finish}
          aria-label="Cerrar tour"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink-soft"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <div className="mb-2 flex items-center gap-1.5">
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-5 bg-pritio-purple" : "w-1.5 bg-line",
              )}
            />
          ))}
        </div>

        <h3 className="pr-8 text-base font-extrabold text-ink">{current.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{current.description}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={isFirst}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted disabled:opacity-40"
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={isLast ? finish : () => setStep((s) => Math.min(s + 1, total - 1))}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
          >
            {isLast ? "¡Listo!" : "Siguiente"}
          </button>
        </div>
      </div>

      {/* Scroll lock */}
      <div aria-hidden style={{ position: "fixed", inset: 0 }} />
    </div>,
    document.body,
  );
}
