import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emitAppEvent } from "@/lib/appEvents";
import type { GlobalViewKey } from "@/components/layout/globalNav";
import { cn } from "@/lib/utils";

interface GlobalFABProps {
  globalView: GlobalViewKey | null;
}

/**
 * Botón flotante "+" presente en todas las vistas.
 * - Vistas normales: abre el modal de captura de tarea.
 * - Notas: abre menú con "Nueva nota" / "Nueva carpeta".
 * - Proyectos: abre el modal de nuevo proyecto.
 */
export function GlobalFAB({ globalView }: GlobalFABProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const handleClick = () => {
    if (globalView === "docs") {
      setOpen((o) => !o);
    } else if (globalView === "proyectos") {
      emitAppEvent("pritio:create-project");
    } else {
      emitAppEvent("pritio:create-task");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Agregar"
        aria-expanded={globalView === "docs" ? open : undefined}
        data-tour="floating-plus"
        className={cn(
          "fixed z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-pritio-purple to-pritio-blue text-white shadow-elevated transition-all hover:scale-105 hover:shadow-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/50 active:shadow-inner",
          "bottom-[calc(7rem+env(safe-area-inset-bottom))] right-4 lg:bottom-6 lg:right-6",
        )}
      >
        {globalView === "docs" && open ? (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        ) : (
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
      </button>

      {open &&
        globalView === "docs" &&
        createPortal(
          <div
            ref={menuRef}
            className="pritio-menu-enter fixed z-[60] right-4 bottom-[calc(10.5rem+env(safe-area-inset-bottom))] w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-elevated lg:bottom-24"
          >
            <p className="px-3.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              Documentos
            </p>
            <button
              type="button"
              onClick={() => {
                emitAppEvent("pritio:create-doc");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-pritio-purple/10 text-pritio-purple">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 9.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2V3c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M5 7h6M5 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </span>
              Nueva nota
            </button>
            <button
              type="button"
              onClick={() => {
                emitAppEvent("pritio:create-folder");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-pritio-blue/10 text-pritio-blue">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                  <path d="M2 5a1.5 1.5 0 011.5-1.5h2.6c.35 0 .68.15.91.41l.62.71c.23.26.56.41.9.41h3.47A1.5 1.5 0 0113.5 6.5v4A1.5 1.5 0 0112 12H3.5A1.5 1.5 0 012 10.5V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
              </span>
              Nueva carpeta
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}