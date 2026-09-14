import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, addDaysStr, formatDayLabel, todayStr } from "@/lib/utils";
import { useTimeFormat } from "@/lib/timeFormat";
import { TimePicker } from "@/components/TimePicker";
import { MiniCalendar } from "@/components/layout/MiniCalendar";

function dayOffsetLabel(day: string): string {
  if (!day) return "";
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString("es-MX", { weekday: "short" });
}

function fmtTime(time: string, is12: boolean): string {
  if (!time) return "";
  const [hh, mm] = time.split(":");
  if (!is12) return `${hh}:${mm}`;
  const h = Number(hh) % 12 || 12;
  return `${h}:${mm} ${Number(hh) < 12 ? "AM" : "PM"}`;
}

interface WeekdayShort {
  hoy: string;
  manana: string;
  prox: string;
}

interface QuickDatePickerProps {
  /** yyyy-mm-dd local; "" = sin fecha. */
  date: string;
  /** HH:mm local; "" = sin hora. */
  time: string;
  onChange: (date: string, time: string) => void;
  /** Muestra/permite editar hora. Con false, la hora se ignora (all-day). */
  withTime?: boolean;
  /** Muestra la opción "Sin fecha" para limpiar. */
  allowClear?: boolean;
  placeholder?: string;
  accent?: "blue" | "purple" | "coral";
  className?: string;
}

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="5.8" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5V8l2.2 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRightIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BackIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path d="M13 8H3M6.5 4.5L3 8l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function QuickDatePicker({
  date,
  time,
  onChange,
  withTime = true,
  allowClear = false,
  placeholder = "Sin fecha",
  accent = "blue",
  className,
}: QuickDatePickerProps) {
  const is12 = useTimeFormat() === "12h";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"popover" | "sheet">("popover");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const [view, setView] = useState<"quick" | "calendar">("quick");
  const [highlight, setHighlight] = useState(0);
  const [editingKey, setEditingKey] = useState<"hoy" | "manana" | "prox" | null>(null);
  const [noTime, setNoTime] = useState(false);
  const [times, setTimes] = useState<Record<"hoy" | "manana" | "prox", string>>({
    hoy: "09:00",
    manana: "09:00",
    prox: "09:00",
  });
  const [calendarDay, setCalendarDay] = useState("");
  const [calendarTime, setCalendarTime] = useState("09:00");

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setMode(mq.matches ? "sheet" : "popover");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const today = todayStr();
    const tmr = addDaysStr(1);
    const pwk = addDaysStr(7);
    const seed = (target: string) => `${target === date ? (time || "09:00") : "09:00"}`;
    setTimes({ hoy: seed(today), manana: seed(tmr), prox: seed(pwk) });
    setNoTime(!time);
    setView("quick");
    setHighlight(0);
    setEditingKey(null);
    setCalendarDay("");
    setCalendarTime(time || "09:00");
    const id = window.setTimeout(() => listRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const quickKeys: Array<"hoy" | "manana" | "prox" | "sinhora" | "calendar" | "clear"> = [
    "hoy",
    "manana",
    "prox",
    ...(withTime ? (["sinhora"] as const) : []),
    "calendar",
    ...(allowClear && date ? (["clear"] as const) : []),
  ];

  const quickDate: Record<"hoy" | "manana" | "prox", string> = {
    hoy: todayStr(),
    manana: addDaysStr(1),
    prox: addDaysStr(7),
  };
  const weekdayShort: WeekdayShort = {
    hoy: "",
    manana: dayOffsetLabel(addDaysStr(1)),
    prox: dayOffsetLabel(addDaysStr(7)),
  };

  const close = () => setOpen(false);

  const applyQuick = (key: "hoy" | "manana" | "prox") => {
    const d = quickDate[key];
    const t = withTime && !noTime ? times[key] : "";
    onChange(d, t);
    close();
  };

  const quickRightLabel = (key: "hoy" | "manana" | "prox") => {
    if (!withTime) return `${weekdayShort[key] || "Hoy"}`;
    return `${weekdayShort[key] ? `${weekdayShort[key]} ` : ""}${fmtTime(times[key], is12) || "--:--"}`;
  };

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || mode === "sheet") {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = panelRef.current?.offsetWidth || 288;
      let left = rect.right - width;
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
  }, [open, mode, view]);

  function handlePanelKeyDown(e: React.KeyboardEvent) {
    if (view === "calendar") return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, quickKeys.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const k = quickKeys[highlight];
      if (!k) return;
      if (k === "hoy" || k === "manana" || k === "prox") applyQuick(k);
      else if (k === "sinhora") toggleNoTime();
      else if (k === "calendar") setView("calendar");
      else if (k === "clear") {
        onChange("", "");
        close();
      }
    }
  }

  const toggleNoTime = () => {
    const next = !noTime;
    setNoTime(next);
    if (date) onChange(date, next ? "" : (time || (times.hoy || "09:00")));
  };

  const triggerLabel = date
    ? withTime && time
      ? `${formatDayLabel(date)} · ${fmtTime(time, is12)}`
      : formatDayLabel(date)
    : placeholder;

  const accentFocus = cn(
    accent === "blue"
      ? "border-pritio-blue ring-pritio-blue/20"
      : accent === "purple"
        ? "border-pritio-purple ring-pritio-purple/20"
        : "border-pritio-coral ring-pritio-coral/20",
  );

  const rowSelectedCheck = (rowDate: string) => date && rowDate === date;

  return (
    <div className={className}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
          open
            ? cn("bg-surface-subtle", accentFocus, "ring-1")
            : date
              ? "border-line bg-surface-subtle text-ink hover:border-line-strong"
              : "border-dashed border-line-strong/70 bg-surface-subtle/50 text-ink-muted hover:border-pritio-blue/40",
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
        <svg
          className={cn(
            "h-3 w-3 shrink-0 text-ink-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        createPortal(
          <>
            {mode === "sheet" && <div className="fixed inset-0 z-[10001] bg-ink/25" aria-hidden="true" />}
            <div
              ref={panelRef}
              data-pritio-popover="true"
              role="dialog"
              aria-label="Seleccionar fecha"
              style={
                mode === "popover"
                  ? { top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }
                  : undefined
              }
              className={cn(
                "pritio-menu-enter fixed z-[10002] border border-line bg-surface shadow-elevated",
                mode === "popover"
                  ? "w-[18rem] max-w-[calc(100vw-1rem)] rounded-xl p-1.5"
                  : "inset-x-0 bottom-0 rounded-t-2xl p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
              )}
            >
              <div className={cn(mode === "sheet" && "mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong")} />

              {view === "quick" ? (
                <div
                  ref={listRef}
                  role="listbox"
                  aria-label="Fechas rápidas"
                  tabIndex={-1}
                  onKeyDown={handlePanelKeyDown}
                  className="outline-none"
                >
                  {(["hoy", "manana", "prox"] as const).map((k, i) => {
                    const active = highlight === i;
                    const selected = rowSelectedCheck(quickDate[k]) === true;
                    return (
                      <div
                        key={k}
                        role="option"
                        aria-selected={selected}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => applyQuick(k)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                          active ? "bg-pritio-blue/10 text-ink" : "text-ink hover:bg-surface-muted",
                        )}
                      >
                        {k === "prox" ? (
                          <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-muted" />
                        ) : (
                          <ClockIcon className="h-4 w-4 shrink-0 text-ink-muted" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm capitalize">{k === "prox" ? "Próxima semana" : k === "hoy" ? "Hoy" : "Mañana"}</span>
                        {withTime ? (
                          editingKey === k ? (
                            <span onClick={(e) => e.stopPropagation()} className="w-[6.5rem] shrink-0">
                              <TimePicker
                                compact
                                value={times[k]}
                                onChange={(v) => setTimes((t) => ({ ...t, [k]: v }))}
                                accent={accent}
                              />
                            </span>
                          ) : (
                            <span
                              role="button"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingKey(k);
                              }}
                              className={cn(
                                "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition-colors",
                                active
                                  ? "border-pritio-blue/40 text-pritio-blue"
                                  : "border-line text-ink-soft hover:bg-surface-muted",
                              )}
                              aria-label={`Cambiar hora de ${k === "prox" ? "próxima semana" : k}`}
                            >
                              {quickRightLabel(k)}
                            </span>
                          )
                        ) : (
                          <span className="shrink-0 text-[11px] font-medium tabular-nums text-ink-soft">
                            {quickRightLabel(k)}
                          </span>
                        )}
                        {selected && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-pritio-blue" />}
                      </div>
                    );
                  })}

                  {withTime && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={noTime}
                      onMouseEnter={() => setHighlight(quickKeys.indexOf("sinhora"))}
                      onClick={toggleNoTime}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        highlight === quickKeys.indexOf("sinhora") ? "bg-pritio-blue/10 text-ink" : "text-ink-soft hover:bg-surface-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                          noTime ? "border-pritio-blue bg-pritio-blue text-white" : "border-line-strong text-transparent",
                        )}
                      >
                        <CheckIcon className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">Sin hora</span>
                      {date && !time && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-pritio-blue" />}
                    </button>
                  )}

                  <div className="mx-2 my-1.5 h-px bg-line" />

                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseEnter={() => setHighlight(quickKeys.indexOf("calendar"))}
                    onClick={() => setView("calendar")}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                      highlight === quickKeys.indexOf("calendar") ? "bg-pritio-blue/10 text-ink" : "text-ink hover:bg-surface-muted",
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 text-ink-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm">Elegir fecha…</span>
                  </button>

                  {allowClear && date && (
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseEnter={() => setHighlight(quickKeys.indexOf("clear"))}
                      onClick={() => {
                        onChange("", "");
                        close();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                        highlight === quickKeys.indexOf("clear") ? "bg-pritio-blue/10 text-ink" : "text-ink-soft hover:bg-surface-muted",
                      )}
                    >
                      <svg className="h-4 w-4 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span className="min-w-0 flex-1 truncate text-sm">Sin fecha</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="outline-none">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setView("quick")}
                      className="rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                      aria-label="Volver a fechas rápidas"
                    >
                      <BackIcon className="h-3.5 w-3.5" />
                    </button>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                      {calendarDay ? "Hora" : "Calendario"}
                    </p>
                  </div>

                  {!calendarDay ? (
                    <div className="mt-1">
                      <MiniCalendar
                        taskDates={[]}
                        blockedDates={[]}
                        alwaysClickable
                        selectedDate={date || null}
                        initialDate={date || undefined}
                        onDayClick={(d) => setCalendarDay(d)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2 px-1 pt-1">
                      <p className="text-sm font-semibold text-ink">{formatDayLabel(calendarDay)}</p>
                      {withTime && (
                        <div className="flex items-center gap-2">
                          <TimePicker compact value={calendarTime} onChange={setCalendarTime} accent={accent} />
                          <button
                            type="button"
                            onClick={() => setNoTime((v) => !v)}
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
                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setCalendarDay("")}
                          className="flex-1 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-muted"
                        >
                          Cambiar fecha
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(calendarDay, withTime && !noTime ? calendarTime : "");
                            close();
                          }}
                          className="flex-1 rounded-lg bg-pritio-blue px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-pritio-blue/90"
                        >
                          Confirmar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}