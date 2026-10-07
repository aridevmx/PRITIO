import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn, localDateStr, todayStr } from "@/lib/utils";
import { useTimeFormat } from "@/lib/timeFormat";
import { usePopover } from "@/hooks/usePopover";
import { TimePicker } from "@/components/TimePicker";
import { AppIcon } from "@/components/AppIcon";
import { CalendarBlank, CaretDown } from "@phosphor-icons/react";
import { MiniCalendar } from "@/components/layout/MiniCalendar";

/** Siguiente día hábil (lun-vie) estrictamente después de hoy. */
function nextWeekdayStr(): string {
  const d = new Date();
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return localDateStr(d);
}

/** Próximo lunes estrictamente después de hoy. */
function nextMondayStr(): string {
  const d = new Date();
  const days = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/** Próximo sábado estrictamente después de hoy. */
function nextSaturdayStr(): string {
  const d = new Date();
  const days = ((6 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function nextOccurrence(targetDow: number): string {
  const d = new Date();
  const days = targetDow === d.getDay() ? 7 : (targetDow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function isValidIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, day] = value.split("-").map(Number);
  if (m < 1 || m > 12 || day < 1 || day > 31) return false;
  const check = new Date(y, m - 1, day);
  return (
    check.getFullYear() === y &&
    check.getMonth() === m - 1 &&
    check.getDate() === day
  );
}

/** Convierte texto libre ("12 ago", "hoy", "mañana", "lunes", ISO...) en fecha yyyy-mm-dd local. */
function parseDateText(text: string): string | null {
  const t = normalize(text);
  if (!t) return null;
  if (isValidIso(t)) return t;
  if (t === "hoy") return todayStr();
  if (t === "manana") return localDateStr(new Date(Date.now() + 86400000));
  const weekdayIndex = WEEKDAYS.findIndex(
    (w) => t === w || (t.length >= 3 && t === w.slice(0, t.length)),
  );
  if (weekdayIndex >= 0) return nextOccurrence(weekdayIndex);
  const m = t.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (m) {
    const day = Number(m[1]);
    let month = MONTHS.indexOf(m[2]);
    if (month < 0) month = MONTHS_SHORT.indexOf(m[2]);
    if (month < 0 || day < 1 || day > 31) return null;
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    const candidate = new Date(year, month, day);
    if (
      candidate.getMonth() !== month ||
      candidate.getDate() !== day
    ) {
      return null;
    }
    const iso = localDateStr(candidate);
    return iso < todayStr() && !m[3] ? localDateStr(new Date(year + 1, month, day)) : iso;
  }
  return null;
}

function fmtTime(value: string, is12: boolean): string {
  if (!value) return "";
  const [hh, mm] = value.split(":");
  if (!is12) return `${hh}:${mm}`;
  const h = Number(hh) % 12 || 12;
  return `${h}:${mm} ${Number(hh) < 12 ? "AM" : "PM"}`;
}

function formatEditable(value: string): string {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Shortcut {
  key: "tomorrow" | "nextWeek" | "nextWeekend" | "clear";
  label: string;
  compute: () => string | null;
}

interface DatePickerFieldProps {
  /** Identificador/aria-label del campo. */
  field: string;
  /** Valor actual (yyyy-mm-dd). "" = sin fecha. */
  value: string;
  /** Hora opcional (HH:mm) cuando showTime está activo. */
  time?: string;
  onChange: (date: string | null, time?: string) => void;
  /** Fecha mínima seleccionable (yyyy-mm-dd); opciones anteriores se ignoran. */
  minDate?: string;
  showTime?: boolean;
  accent?: "blue" | "purple" | "coral";
  placeholder?: string;
  /** Mensaje de validación inline (p. ej. "Fin no puede ser anterior a Inicio"). */
  error?: string;
  className?: string;
  align?: "left" | "right";
}

const SHORTCUTS: Shortcut[] = [
  { key: "tomorrow", label: "Mañana", compute: () => nextWeekdayStr() },
  { key: "nextWeek", label: "Próxima semana", compute: () => nextMondayStr() },
  { key: "nextWeekend", label: "Próximo fin de semana", compute: () => nextSaturdayStr() },
];

export function DatePickerField({
  field,
  value,
  time = "",
  onChange,
  minDate,
  showTime = false,
  accent = "blue",
  placeholder = "Sin fecha",
  error,
  className,
  align = "left",
}: DatePickerFieldProps) {
  const is12 = useTimeFormat() === "12h";
  const { anchorRef, panelRef, open, setOpen, toggle, close, pos } = usePopover<HTMLDivElement>({
    align,
  });
  const [text, setText] = useState(() => formatEditable(value));
  const [editing, setEditing] = useState(false);
  const [noTime, setNoTime] = useState(!time);

  useEffect(() => {
    if (!editing) setText(formatEditable(value));
  }, [value, time, editing]);

  const selected = isValidIso(value) ? value : null;
  const selectedBeforeMin = Boolean(selected && minDate && selected < minDate);
  const shortcutRows = useMemo(
    () =>
      SHORTCUTS.map((s) => {
        const target = s.compute();
        const disabled = Boolean(target && minDate && target < minDate);
        return { ...s, target, disabled };
      }),
    [minDate],
  );

  const accentFocus = cn(
    accent === "blue"
      ? "border-pritio-blue ring-pritio-blue/20"
      : accent === "purple"
        ? "border-pritio-purple ring-pritio-purple/20"
        : "border-pritio-coral ring-pritio-coral/20",
  );

  const commitDate = (next: string | null) => {
    onChange(next, showTime && !noTime ? time : "");
    if (!showTime) close();
  };

  const handleCommit = (closeAfter = false) => {
    setEditing(false);
    const parsed = parseDateText(text);
    if (parsed && isValidIso(parsed) && (!minDate || parsed >= minDate)) {
      onChange(parsed, time);
      if (closeAfter) close();
      return;
    }
    setText(formatEditable(value));
  };

  return (
    <div className={className}>
      <div
        ref={anchorRef}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
          open
            ? cn("bg-surface-subtle", accentFocus, "ring-1")
            : error
              ? "border-pritio-coral bg-surface-subtle"
              : value
                ? "border-line bg-surface-subtle hover:border-line-strong"
                : "border-dashed border-line-strong/70 bg-surface-subtle/50 hover:border-pritio-blue/40",
        )}
      >
        <AppIcon glyph={CalendarBlank} className="text-ink-muted" />
        <input
          id={field}
          value={editing ? text : selected ? formatEditable(selected) : ""}
          onChange={(e) => {
            setEditing(true);
            setText(e.target.value);
          }}
          onFocus={() => {
            setEditing(true);
            setOpen(true);
          }}
          onBlur={() => handleCommit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCommit(true);
            }
          }}
          placeholder={placeholder}
          aria-label={field}
          aria-expanded={open}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
        {!editing && selected && showTime && time && (
          <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink-soft">
            {fmtTime(time, is12)}
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label="Abrir calendario"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
        >
          <AppIcon
            glyph={CaretDown}
            size="xs"
            className={cn("transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </div>

      {error && <p className="mt-1 text-[11px] font-medium text-pritio-coral">{error}</p>}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-pritio-popover="true"
            role="dialog"
            aria-label={field}
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            className="pritio-menu-enter fixed z-[10002] w-[19rem] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-2 shadow-elevated"
          >
            <div className="space-y-0.5">
              {shortcutRows.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  disabled={s.disabled}
                  onClick={() => {
                    if (s.target) commitDate(s.target);
                    else {
                      onChange(null, "");
                      close();
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                    s.disabled
                      ? "cursor-not-allowed text-ink-muted/40"
                      : "text-ink hover:bg-surface-muted",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-ink-soft">
                    {s.target ? formatEditable(s.target) : ""}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onChange(null, "");
                  close();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  value ? "text-ink-soft hover:bg-surface-muted" : "cursor-not-allowed text-ink-muted/40",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm">Sin fecha</span>
              </button>
            </div>

            <div className="mx-2 my-2 h-px bg-line" />

            <div className="px-1">
              <MiniCalendar
                taskDates={[]}
                blockedDates={[]}
                pendingDates={[]}
                alwaysClickable
                selectedDate={selectedBeforeMin ? null : selected}
                initialDate={selected || undefined}
                onDayClick={(d) => {
                  if (minDate && d < minDate) return;
                  if (showTime) {
                    onChange(d, noTime ? "" : time || "09:00");
                  } else {
                    onChange(d, "");
                    close();
                  }
                }}
              />
            </div>

            {showTime && selected && (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-line px-1 pt-2">
                <TimePicker
                  compact
                  value={time}
                  onChange={(t) => onChange(selected, t)}
                  accent={accent}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = !noTime;
                    setNoTime(next);
                    onChange(selected, next ? "" : time || "09:00");
                  }}
                  className={cn(
                    "shrink-0 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                    noTime
                      ? "border-pritio-blue bg-pritio-blue/5 text-pritio-blue"
                      : "border-line text-ink-soft hover:bg-surface-muted",
                  )}
                >
                  Sin hora
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}