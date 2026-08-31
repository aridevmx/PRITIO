import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useTimeFormat,
  formatTime as formatTimeBase,
} from "@/lib/timeFormat";
import {
  getClockShowSeconds,
  setClockShowSeconds,
  useExpandedWidget,
} from "@/lib/widgetPrefs";
import { playSound } from "@/lib/sounds";

function formatTimeWithSeconds(date: Date, hour12: boolean): string {
  return date.toLocaleTimeString(hour12 ? "en-US" : "es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(hour12 ? { hour12: true } : { hour12: false }),
  });
}

/** Sí/no stilos: 12h español con AM/PM y segundos. */
function formatClock(date: Date, showSeconds: boolean, hour12: boolean): string {
  if (showSeconds) return formatTimeWithSeconds(date, hour12);
  return formatTimeBase(date, hour12 ? "12h" : "24h");
}

export function SidebarClock() {
  const timeFormat = useTimeFormat();
  const { expanded, expand } = useExpandedWidget();
  const isExpanded = expanded === "clock";
  const [alwaysShowSeconds, setAlwaysShowSeconds] = useState(getClockShowSeconds);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const hour12 = timeFormat === "12h";
  const display = formatClock(now, alwaysShowSeconds, hour12);

  const [timer, setTimer] = useState<{
    total: number;
    remaining: number;
    running: boolean;
    done: boolean;
  } | null>(null);
  const [draftMin, setDraftMin] = useState(25);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!timer || !timer.running) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = window.setInterval(() => {
      setTimer((t) => {
        if (!t) return t;
        const remaining = Math.max(0, t.remaining - 1);
        if (remaining === 0 && t.remaining !== 0) playSound("notification");
        return { ...t, remaining, running: remaining > 0 && t.running, done: remaining === 0 };
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [timer?.running]);

  const hours = timer ? Math.floor(timer.remaining / 3600) : 0;
  const mins = timer ? Math.floor((timer.remaining % 3600) / 60) : 0;
  const secs = timer ? timer.remaining % 60 : 0;
  const pct = timer && timer.total > 0 ? (1 - timer.remaining / timer.total) * 100 : 0;

  const startTimer = () => {
    setTimer({ total: Math.max(1, draftMin) * 60, remaining: Math.max(1, draftMin) * 60, running: true, done: false });
  };
  const pauseTimer = () => setTimer((t) => (t ? { ...t, running: false } : t));
  const resumeTimer = () => setTimer((t) => (t ? { ...t, running: true } : t));
  const resetTimer = () => setTimer((t) => (t ? { ...t, remaining: t.total, running: false, done: false } : t));

  return (
    <div className="border-t border-line pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Reloj</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setClockShowSeconds(!alwaysShowSeconds);
              setAlwaysShowSeconds(!alwaysShowSeconds);
            }}
            title="Mostrar segundos"
            aria-pressed={alwaysShowSeconds}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => expand(isExpanded ? null : "clock")}
            title={isExpanded ? "Reducir" : "Agrandar"}
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden>
              {isExpanded ? (
                <path d="M9 4H12V7M7 12H4V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 7H7V4M12 9H9V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-line bg-surface px-3 pt-3",
          isExpanded ? "py-5 gap-3" : "pb-2.5 gap-1.5",
        )}
      >
        <span
          className={cn(
            "font-semibold tabular-nums tracking-tight text-ink",
            isExpanded ? "text-4xl" : "text-2xl",
          )}
        >
          {display}
        </span>
        {hour12 && !alwaysShowSeconds && <span className="text-[11px] text-ink-muted">AM/PM</span>}

        {isExpanded && (
          <div className="w-full space-y-3">
            <div className="grid grid-cols-6 gap-1">
              {timer ? (
                <>
                  <div className="col-span-4 flex items-center justify-center gap-2 text-sm font-semibold tabular-nums text-ink">
                    {String(hours).padStart(2, "0")}:{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                  </div>
                  <div className="col-span-2 flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={timer.running ? pauseTimer : resumeTimer}
                      className="grid h-8 w-8 place-items-center rounded-lg bg-pritio-blue text-white transition-opacity hover:opacity-90"
                      disabled={timer.done}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                        {timer.running ? (
                          <path d="M3.5 2v8M8.5 2v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        ) : (
                          <path d="M3 2l7 4-7 4z" />
                        )}
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={resetTimer}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-muted hover:bg-surface-muted"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" aria-hidden>
                        <path d="M1.5 4.5A4.5 4.5 0 1 1 2 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        <path d="M1.5 1.5v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="col-span-6 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full rounded-full bg-pritio-blue transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </>
              ) : (
                <div className="col-span-6 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={draftMin}
                    onChange={(e) => setDraftMin(Number(e.target.value) || 1)}
                    className="h-9 w-16 rounded-lg border border-line bg-surface-subtle px-2 text-center text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-pritio-blue/30"
                    aria-label="Minutos del timer"
                  />
                  <span className="text-sm text-ink-soft">min</span>
                  <button
                    type="button"
                    onClick={startTimer}
                    className="ml-auto h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Iniciar
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-4 text-[11px] text-ink-muted">
              <button
                type="button"
                onClick={() => {
                  setClockShowSeconds(!alwaysShowSeconds);
                  setAlwaysShowSeconds(!alwaysShowSeconds);
                }}
                className="font-medium text-pritio-purple hover:text-pritio-purple/80"
              >
                {alwaysShowSeconds ? "Ocultar segundos" : "Mostrar segundos"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
