import { useEffect, useRef, useState } from "react";
import { cn, addDaysStr, formatDayLabel } from "@/lib/utils";
import { MiniCalendar } from "@/components/layout/MiniCalendar";

const PRESETS = [
  { label: "Hoy", days: 0 },
  { label: "Mañana", days: 1 },
  { label: "1 sem", days: 7 },
];

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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
    <div ref={rootRef} className={cn("relative", className)}>
      <button
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

      {open && (
        <div
          className={cn(
            "pritio-menu-enter absolute top-full z-40 mt-1.5 w-[17.5rem] rounded-xl border border-line bg-surface p-2.5 shadow-elevated",
            align === "right" ? "right-0" : "left-0",
          )}
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
        </div>
      )}
    </div>
  );
}
