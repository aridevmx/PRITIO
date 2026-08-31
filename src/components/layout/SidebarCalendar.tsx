import { useMemo, useState } from "react";
import { cn, localDateStr, todayStr } from "@/lib/utils";
import { MiniCalendar } from "@/components/layout/MiniCalendar";
import { useDayActivity } from "@/features/calendar/useDayActivity";
import { SegmentedControl } from "@/components/SegmentedControl";

const WEEK_DAYS = ["L", "M", "X", "J", "V", "S", "D"];

type CalendarScope = "workspace" | "all";

interface SidebarCalendarProps {
  scope: CalendarScope;
  onScopeChange: (scope: CalendarScope) => void;
  workspaceId: string | null;
  userId: string | null;
  taskDates: string[];
  blockedDates: string[];
  pendingDates: string[];
  onDayClick?: (dateStr: string) => void;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("es-MX", { day: "numeric" });
  const endLabel = end.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
  return sameMonth
    ? `Semana del ${startLabel}–${endLabel}`
    : `Semana del ${start.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}–${endLabel}`;
}

export function SidebarCalendar({
  scope,
  onScopeChange,
  workspaceId,
  userId,
  taskDates,
  blockedDates,
  pendingDates,
  onDayClick,
}: SidebarCalendarProps) {
  const [expanded, setExpanded] = useState(false);

  const today = todayStr();
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = weekDays[6];

  const from = localDateStr(weekStart);
  const to = localDateStr(weekEnd);

  const { counts } = useDayActivity({ scope, workspaceId, userId, from, to });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-muted uppercase tracking-wide">Calendario</p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-semibold text-pritio-purple hover:text-pritio-purple/80 transition-colors"
        >
          {expanded ? "Contraer calendario" : "Expandir calendario"}
        </button>
      </div>

      <SegmentedControl
        value={scope}
        onChange={(v) => onScopeChange(v as CalendarScope)}
        options={[
          { value: "workspace", label: "Este espacio" },
          { value: "all", label: "Todos los espacios" },
        ]}
        size="sm"
        className="mb-3"
      />

      {expanded ? (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <MiniCalendar
            taskDates={taskDates}
            blockedDates={blockedDates}
            pendingDates={pendingDates}
            onDayClick={onDayClick}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-pritio-blue" />
              Tareas / Eventos / Juntas
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-rose-500" />
              Bloqueado
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="block h-1.5 w-1.5 rounded-full bg-amber-400" />
              Pendiente
            </span>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold text-ink">
            {formatWeekRange(weekStart, weekEnd)}
          </p>

          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEK_DAYS.map((d) => (
                <div key={d} className="text-[10px] font-medium text-ink-muted py-1">
                  {d}
                </div>
              ))}
              {weekDays.map((day) => {
                const dateStr = localDateStr(day);
                const activity = counts[dateStr] ?? { count: 0, blocked: false, pending: false };
                const isToday = dateStr === today;
                const hasActivity = activity.count > 0 || activity.blocked || activity.pending;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => onDayClick?.(dateStr)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-purple/40",
                      isToday && "bg-surface-muted ring-1 ring-pritio-blue/40",
                      !isToday && "hover:bg-surface-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                        isToday ? "bg-pritio-blue text-white" : "text-ink-soft",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <span className="flex h-3.5 items-center justify-center gap-0.5">
                      {activity.blocked && (
                        <span className="block h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
                      )}
                      {!activity.blocked && activity.pending && (
                        <span className="block h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
                      )}
                      {activity.count > 0 && (
                        <>
                          {activity.count <= 2 ? (
                            Array.from({ length: activity.count }).map((_, i) => (
                              <span
                                key={i}
                                className="block h-1.5 w-1.5 rounded-full bg-pritio-blue"
                                aria-hidden
                              />
                            ))
                          ) : (
                            <span className="text-[9px] font-bold text-pritio-blue">+{activity.count}</span>
                          )}
                        </>
                      )}
                      {!hasActivity && <span className="block h-1.5 w-1.5 rounded-full bg-transparent" aria-hidden />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
