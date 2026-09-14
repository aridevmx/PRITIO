import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, addDaysStr, formatDayLabel } from "@/lib/utils";
import { MiniCalendar } from "@/components/layout/MiniCalendar";

const PRESETS = [
  { label: "Hoy", days: 0 },
  { label: "Mañana", days: 1 },
  { label: "1 sem", days: 7 },
];

const CALENDAR_WIDTH = 280;

interface DatePickerPopoverProps {
  /** Valor actual yyyy-mm-dd; "" = sin fecha. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Muestra accesos rápidos Hoy / Mañana / 1 sem. */
  presets?: boolean;
  /** Muestra acción Limpiar cuando hay valor. */
  clearable?: boolean;
  /** Alineación del panel respecto al trigger (útil en el rail derecho). */
  align?: "left" | "right";
  className?: string;
}

/**
 * Selector de fecha con calendario. El panel se renderiza vía portal con
 * posición fixed anclada al trigger, para que NO se recorte dentro de
 * contenedores con overflow/scroll (modales, paneles flotantes tipo
 * PropertyRow). Se voltea hacia arriba cuando no cabe debajo.
 */
export function DatePickerPopover({
  value,
  onChange,
  placeholder = "Selecciona fecha",
  presets,
  clearable,
  align = "left",
  className,
}: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = panelRef.current?.offsetWidth || CALENDAR_WIDTH;
      let left = align === "right" ? rect.right - width : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const height = panelRef.current?.offsetHeight ?? 0;
      let top = rect.bottom + 6;
      if (height > 0 && top + height > window.innerHeight - 8) {
        top = Math.max(8, Math.min(rect.top - height - 6, window.innerHeight - height - 8));
      }
      setPos({ top, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
          value
            ? "border-line bg-surface-subtle text-ink hover:border-line-strong"
            : "border-dashed border-line-strong/70 bg-surface-subtle/50 text-ink-muted hover:border-pritio-blue/50",
          open && "border-pritio-blue ring-2 ring-pritio-blue/20",
        )}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
          <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate">{value ? formatDayLabel(value) : placeholder}</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-pritio-popover="true"
            role="dialog"
            aria-label={placeholder}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className="pritio-menu-enter fixed z-[10001] w-[17.5rem] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-2.5 shadow-elevated"
          >
            {(presets || clearable) && (
              <div className="mb-2 flex items-center gap-1">
                {presets &&
                  PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        onChange(addDaysStr(p.days));
                        setOpen(false);
                      }}
                      className="rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-surface-muted"
                    >
                      {p.label}
                    </button>
                  ))}
                {clearable && value && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="ml-auto rounded-md px-2 py-0.5 text-[11px] font-medium text-ink-muted transition-colors hover:text-pritio-coral"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            )}
            <MiniCalendar
              taskDates={[]}
              blockedDates={[]}
              alwaysClickable
              selectedDate={value || null}
              initialDate={value || undefined}
              onDayClick={(d) => {
                onChange(d);
                setOpen(false);
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}