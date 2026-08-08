import { useMemo, useState } from "react";
import { cn, localDateStr, todayStr } from "@/lib/utils";

const DAYS = ["L", "M", "J", "V", "S", "D"];

interface MiniCalendarProps {
  taskDates: string[];
  blockedDates: string[];
  pendingDates?: string[];
  onDayClick?: (dateStr: string) => void;
}

export function MiniCalendar({
  taskDates,
  blockedDates,
  pendingDates,
  onDayClick,
}: MiniCalendarProps) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const weeks = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const start = new Date(firstDay);
    const startDay = start.getDay();
    const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
    start.setDate(start.getDate() + mondayOffset);

    const weeksArr: Date[][] = [];
    const current = new Date(start);
    while (current <= lastDay || weeksArr.length < 6) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      weeksArr.push(week);
      if (current > lastDay && weeksArr.length >= 4) break;
    }
    return weeksArr;
  }, [viewDate]);

  const taskDateSet = useMemo(
    () => new Set(taskDates.map((d) => d.slice(0, 10))),
    [taskDates],
  );
  const blockedDateSet = useMemo(
    () => new Set(blockedDates.map((d) => d.slice(0, 10))),
    [blockedDates],
  );
  const pendingDateSet = useMemo(
    () => new Set((pendingDates ?? []).map((d) => d.slice(0, 10))),
    [pendingDates],
  );

  const today = useMemo(() => todayStr(), []);

  const monthName = viewDate.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="text-ink-muted hover:text-ink-soft transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="text-sm font-semibold text-pritio-purple capitalize">
          {monthName}
        </span>

        <button
          onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="text-ink-muted hover:text-ink-soft transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0 text-center">
        {DAYS.map((d) => (
          <div key={d} className="text-[10px] font-medium text-ink-muted py-1">
            {d}
          </div>
        ))}
        {weeks.map((week, wi) =>
          week.map((day, di) => {
            const dateStr = localDateStr(day);
            const isCurrentMonth = day.getMonth() === viewDate.getMonth();
            const isToday = dateStr === today;
            const hasTask = taskDateSet.has(dateStr);
            const isBlocked = blockedDateSet.has(dateStr);
            const isPending = pendingDateSet.has(dateStr) && !isBlocked;

            return (
              <div
                key={`${wi}-${di}`}
                className={cn(
                  "relative flex items-center justify-center text-xs py-1",
                  !isCurrentMonth && "text-ink-muted/40",
                  isCurrentMonth && "text-ink-soft",
                  (isCurrentMonth && (hasTask || isBlocked || isPending)) && "cursor-pointer",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (onDayClick) onDayClick(dateStr);
                  }}
                  disabled={!isCurrentMonth}
                  className={cn(
                    "relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    isBlocked && isCurrentMonth && "bg-rose-500 text-white shadow-sm",
                    isPending && isCurrentMonth && "bg-amber-400 text-white shadow-sm",
                    isToday && !isBlocked && !isPending && "border-2 border-teal-400",
                    isToday && (isBlocked || isPending) && "ring-2 ring-teal-400 ring-offset-1",
                    isCurrentMonth && (hasTask || isBlocked || isPending) && "hover:brightness-95 cursor-pointer",
                    !isCurrentMonth && "cursor-default",
                  )}
                >
                  {day.getDate()}
                  {isCurrentMonth && hasTask && (
                    <span className="absolute -bottom-0.5 flex gap-[2px]">
                      <span className="block h-1 w-1 rounded-full bg-pritio-blue" />
                    </span>
                  )}
                </button>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
