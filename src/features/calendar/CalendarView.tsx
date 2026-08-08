import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, localDateStr } from "@/lib/utils";
import { useTasks } from "@/features/tasks/useTasks";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { updateTask as apiUpdateTask } from "@/features/tasks/api";
import { formatTime, useTimeFormat, type TimeFormat } from "@/lib/timeFormat";
import {
  blockedDaysEnabled,
  listWorkspaceBlockedDays,
} from "@/features/calendar/blockedDaysApi";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { BlockedDayStatus, Task } from "@/types";

const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
type ViewMode = "month" | "week" | "day";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 56;
const RESIZE_SNAP_MIN = 15;
const MIN_BLOCK_MIN = 15;

interface BlockedBy {
  userId: string;
  name: string;
  reason: string | null;
  status: BlockedDayStatus;
}

interface CalendarViewProps {
  workspaceId: string;
  space: SpaceKey;
  defaultDate?: string;
}

function getMonthWeeks(date: Date): Date[][] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const start = new Date(firstDay);
  const startDay = start.getDay();
  const mondayOffset = startDay === 0 ? -6 : 1 - startDay;
  start.setDate(start.getDate() + mondayOffset);

  const weeks: Date[][] = [];
  const current = new Date(start);
  for (let r = 0; r < 6; r++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current > lastDay && r >= 3) break;
  }
  return weeks;
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + mondayOffset);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKey(): string {
  return dateToKey(new Date());
}

function hourLabel(h: number, timeFormat: TimeFormat): string {
  if (timeFormat === "12h") {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${h < 12 ? "a.m." : "p.m."}`;
  }
  return `${String(h).padStart(2, "0")}:00`;
}

function taskMinRange(t: Task): { startMin: number; endMin: number } {
  const start = new Date(t.startAt as string);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = t.endAt
    ? new Date(t.endAt).getHours() * 60 + new Date(t.endAt).getMinutes()
    : startMin + 60;
  return { startMin, endMin };
}

function dayMinutesToISO(key: string, minutes: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  return dt.toISOString();
}

export function CalendarView({ workspaceId, space, defaultDate }: CalendarViewProps) {
  const { profile, members } = useWorkspace();
  const { tasks, isLoading } = useTasks(workspaceId);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [viewDate, setViewDate] = useState(() => {
    if (defaultDate) return new Date(defaultDate + "T12:00:00");
    return new Date();
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(defaultDate ?? null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const [dialogTime, setDialogTime] = useState<string | null>(null);
  const [blockedByDate, setBlockedByDate] = useState<Map<string, BlockedBy[]>>(new Map());

  const weeks = useMemo(() => getMonthWeeks(viewDate), [viewDate]);
  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const key = t.startAt ? dateToKey(new Date(t.startAt)) : t.dueDate;
      if (!key) return;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    });
    return map;
  }, [tasks]);

  const blockedEnabled = blockedDaysEnabled(space, members.length);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!blockedEnabled) {
        setBlockedByDate(new Map());
        return;
      }
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      try {
        const rows = await listWorkspaceBlockedDays(workspaceId, localDateStr(from), localDateStr(to));
        if (cancelled) return;
        const map = new Map<string, BlockedBy[]>();
        rows.forEach((r) => {
          if (r.status === "rejected") return;
          const arr = map.get(r.date) ?? [];
          arr.push({ userId: r.userId, name: r.name, reason: r.reason, status: r.status });
          map.set(r.date, arr);
        });
        setBlockedByDate(map);
      } catch (err) {
        console.error("[CalendarView] blocked days fetch error:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, blockedEnabled]);

  const todayStr = todayKey();

  const blockedForDay = (key: string): BlockedBy[] => {
    const list = blockedByDate.get(key);
    if (!list || list.length === 0) return [];
    return list.map((b) => ({
      userId: b.userId,
      name: b.name || (profile?.id === b.userId ? (profile?.fullName || "Tú") : "Miembro"),
      reason: b.reason,
      status: b.status,
    }));
  };

  const selectedTasks = selectedDay ? (tasksByDate.get(selectedDay) ?? []) : [];
  const selectedBlocked = selectedDay ? blockedForDay(selectedDay) : [];

  const dayStatus = (key: string): { blocked: boolean; pending: boolean } => {
    const list = blockedForDay(key);
    return {
      blocked: list.some((b) => b.status === "approved"),
      pending: list.some((b) => b.status === "pending"),
    };
  };

  const monthLabel = viewDate.toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

  const weekLabel = (() => {
    const a = weekDays[0];
    const b = weekDays[6];
    const sameMonth = a.getMonth() === b.getMonth();
    if (sameMonth) {
      return `${a.getDate()} – ${b.getDate()} ${a.toLocaleDateString("es-MX", { month: "long" })} ${a.getFullYear()}`;
    }
    return `${a.getDate()} ${a.toLocaleDateString("es-MX", { month: "short" })} – ${b.getDate()} ${b.toLocaleDateString("es-MX", { month: "short" })} ${b.getFullYear()}`;
  })();

  const dayLabel = viewDate.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const headerLabel = viewMode === "month" ? monthLabel : viewMode === "week" ? weekLabel : dayLabel;

  const nav = (delta: number) => {
    setViewDate((d) => {
      const next = new Date(d);
      if (viewMode === "month") next.setMonth(d.getMonth() + delta);
      else if (viewMode === "week") next.setDate(d.getDate() + delta * 7);
      else next.setDate(d.getDate() + delta);
      return next;
    });
  };

  const goToday = () => {
    const t = new Date();
    setViewDate(viewMode === "month" ? new Date(t.getFullYear(), t.getMonth(), 1) : t);
    setSelectedDay(dateToKey(t));
  };

  const changeView = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectedDay(null);
  };

  const openCreateOnDay = (dateStr: string, time?: string) => {
    setEditingTask(null);
    setDialogDate(dateStr);
    setDialogTime(time ?? null);
    setTaskDialogOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setDialogDate(null);
    setDialogTime(null);
    setTaskDialogOpen(true);
  };

  const viewFullDay = (dateStr: string) => {
    setSelectedDay(null);
    setViewMode("day");
    setViewDate(new Date(dateStr + "T12:00:00"));
  };

  const startTouch = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startTouch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!startTouch.current) return;
    const dx = e.changedTouches[0].clientX - startTouch.current.x;
    const dy = e.changedTouches[0].clientY - startTouch.current.y;
    startTouch.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > 40) return;
    nav(dx < 0 ? 1 : -1);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-ink-soft">Cargando...</div>;
  }

  return (
    <div className="flex gap-4 p-4 lg:p-6">
      <div
        className="min-w-0 flex-1"
        onTouchStart={viewMode === "month" ? handleTouchStart : undefined}
        onTouchEnd={viewMode === "month" ? handleTouchEnd : undefined}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              className="rounded-lg border border-line p-2 text-ink-soft hover:bg-surface-muted"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-ink capitalize">{headerLabel}</h2>
            <button
              onClick={() => nav(1)}
              className="rounded-lg border border-line p-2 text-ink-soft hover:bg-surface-muted"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={goToday}
              className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-soft hover:bg-surface-muted"
            >
              Hoy
            </button>
          </div>

          <div className="flex rounded-lg border border-line bg-surface-muted p-0.5">
            {(["month", "week", "day"] as ViewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => changeView(m)}
                className={cn(
                  "rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                  viewMode === m ? "bg-white text-ink shadow-sm" : "text-ink-soft hover:text-ink",
                )}
              >
                {m === "month" ? "Mes" : m === "week" ? "Semana" : "Día"}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "month" && (
          <div className="rounded-xl border border-line bg-surface">
            <div className="grid grid-cols-7 border-b border-line">
              {DAYS.map((d) => (
                <div key={d} className="px-3 py-2 text-xs font-bold text-ink-muted uppercase">
                  {d}
                </div>
              ))}
            </div>

            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-line last:border-b-0">
                {week.map((day, di) => {
                  const key = dateToKey(day);
                  const isCurrentMonth = day.getMonth() === viewDate.getMonth();
                  const isToday = key === todayStr;
                  const isSelected = key === selectedDay;
                  const dayTasks = tasksByDate.get(key) ?? [];
                  const { blocked: isBlocked, pending: isPending } = dayStatus(key);

                  return (
                    <div
                      key={di}
                      className={cn(
                        "group relative min-h-[64px] border-r border-line p-2 text-left transition-colors last:border-r-0 md:min-h-[90px]",
                        !isCurrentMonth && "bg-surface-muted/40",
                        isBlocked && "bg-rose-50/60",
                        !isBlocked && isPending && "bg-amber-50/60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDay(isSelected ? null : key)}
                        className="block w-full text-left"
                      >
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                            isToday && "bg-pritio-purple text-white shadow-sm",
                            isSelected && !isToday && "bg-pritio-blue text-white",
                            !isToday && !isSelected && "text-ink",
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {isBlocked && (
                          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white">
                            <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                              <rect x="2" y="5" width="8" height="5.5" rx="1" fill="currentColor" />
                              <path d="M4 5V3.5C4 2.4 4.9 1.5 6 1.5C7.1 1.5 8 2.4 8 3.5V5" stroke="currentColor" strokeWidth="1.4" />
                            </svg>
                          </span>
                        )}
                        {!isBlocked && isPending && (
                          <span
                            title="Pendiente de aprobación"
                            className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-white"
                          >
                            <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                              <path d="M6 1.5L10.5 10H1.5L6 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                              <path d="M6 4.5v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                              <circle cx="6" cy="9" r="0.7" fill="currentColor" />
                            </svg>
                          </span>
                        )}
                        <div className="mt-1 space-y-0.5">
                          {dayTasks.slice(0, 3).map((t) => (
                            <div
                              key={t.id}
                              className={cn(
                                "truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight",
                                t.completed
                                  ? "bg-green-50 text-pritio-green line-through"
                                  : "bg-pritio-blue/10 text-pritio-blue",
                              )}
                            >
                              {t.title}
                            </div>
                          ))}
                          {dayTasks.length > 3 && (
                            <div className="text-[10px] text-ink-muted pl-1">
                              +{dayTasks.length - 3} más
                            </div>
                          )}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreateOnDay(key);
                        }}
                        aria-label={`Agregar tarea el ${key}`}
                        className="absolute bottom-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface text-ink-soft opacity-100 shadow-sm transition-all hover:border-pritio-blue hover:text-pritio-blue md:opacity-0 md:group-hover:opacity-100 md:h-5 md:w-5"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                          <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {(viewMode === "week" || viewMode === "day") && (
          <TimeGrid
            days={viewMode === "week" ? weekDays : [viewDate]}
            tasksByDate={tasksByDate}
            blockedForDay={blockedForDay}
            onSlotClick={(dateStr, time) => openCreateOnDay(dateStr, time)}
            onTaskClick={openEdit}
          />
        )}
      </div>

      {/* Day detail modal */}
      {selectedDay && (
        <DayModal
          dateStr={selectedDay}
          tasks={selectedTasks}
          blocked={selectedBlocked}
          onClose={() => setSelectedDay(null)}
          onViewDay={viewFullDay}
          onEditTask={openEdit}
        />
      )}

      <TaskFormDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false);
          setEditingTask(null);
          setDialogDate(null);
          setDialogTime(null);
        }}
        onSaved={() => {
          setTaskDialogOpen(false);
          setEditingTask(null);
          setDialogDate(null);
          setDialogTime(null);
        }}
        task={editingTask}
        defaultDueDate={dialogDate ?? undefined}
        defaultStartTime={dialogTime ?? undefined}
      />
    </div>
  );
}

/* ─── Time grid (week / day) ────────────────────────── */

interface TimeGridProps {
  days: Date[];
  tasksByDate: Map<string, Task[]>;
  blockedForDay: (key: string) => BlockedBy[];
  onSlotClick: (dateStr: string, time: string) => void;
  onTaskClick: (task: Task) => void;
}

function TimeGrid({
  days,
  tasksByDate,
  blockedForDay,
  onSlotClick,
  onTaskClick,
}: TimeGridProps) {
  const timeFormat = useTimeFormat();
  const todayStr = todayKey();
  const [resizing, setResizing] = useState<{ taskId: string; startMin: number; endMin: number } | null>(null);
  const dragRef = useRef<{
    taskId: string;
    key: string;
    edge: "top" | "bottom";
    origStart: number;
    origEnd: number;
    startY: number;
    curStart: number;
    curEnd: number;
  } | null>(null);

  const handleResizeDown = (
    e: React.PointerEvent<HTMLDivElement>,
    task: Task,
    key: string,
    edge: "top" | "bottom",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { startMin, endMin } = taskMinRange(task);
    dragRef.current = {
      taskId: task.id,
      key,
      edge,
      origStart: startMin,
      origEnd: endMin,
      startY: e.clientY,
      curStart: startMin,
      curEnd: endMin,
    };
    setResizing({ taskId: task.id, startMin, endMin });
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaMin =
      Math.round((e.clientY - drag.startY) / (HOUR_HEIGHT / 60) / RESIZE_SNAP_MIN) * RESIZE_SNAP_MIN;
    if (drag.edge === "top") {
      const startMin = Math.max(0, Math.min(drag.origEnd - MIN_BLOCK_MIN, drag.origStart + deltaMin));
      drag.curStart = startMin;
      drag.curEnd = drag.origEnd;
      setResizing({ taskId: drag.taskId, startMin, endMin: drag.origEnd });
    } else {
      const endMin = Math.min(24 * 60, Math.max(drag.origStart + MIN_BLOCK_MIN, drag.origEnd + deltaMin));
      drag.curStart = drag.origStart;
      drag.curEnd = endMin;
      setResizing({ taskId: drag.taskId, startMin: drag.origStart, endMin });
    }
  };

  const handleResizeUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setResizing(null);
    if (drag.curStart === drag.origStart && drag.curEnd === drag.origEnd) return;
    void apiUpdateTask(drag.taskId, {
      startAt: dayMinutesToISO(drag.key, drag.curStart),
      endAt: dayMinutesToISO(drag.key, drag.curEnd),
    }).catch((err) => console.error("[CalendarView] resize update failed:", err));
  };

  const dayStatus = (key: string): { blocked: boolean; pending: boolean } => {
    const list = blockedForDay(key);
    return {
      blocked: list.some((b) => b.status === "approved"),
      pending: list.some((b) => b.status === "pending"),
    };
  };

  return (
    <div className="overflow-auto rounded-xl border border-line bg-surface max-h-[calc(100vh-260px)]">
      <div className={days.length === 1 ? "min-w-0" : "min-w-[720px]"}>
        {/* Day headers */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
          <div className="w-14 shrink-0 border-r border-line" />
          {days.map((day, i) => {
            const key = dateToKey(day);
            const isToday = key === todayStr;
            const { blocked: isBlocked, pending: isPending } = dayStatus(key);
            return (
              <div
                key={key}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 border-r border-line px-1 py-2 last:border-r-0",
                  isBlocked && "bg-rose-50/60",
                  !isBlocked && isPending && "bg-amber-50/60",
                )}
              >
                <span className={cn("text-[10px] font-bold uppercase", isToday ? "text-pritio-purple" : "text-ink-muted")}>
                  {DAYS[i]}
                </span>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-pritio-purple text-white shadow-sm" : "text-ink",
                  )}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* All-day strip */}
        <div className="flex border-b border-line">
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-surface px-1 py-1.5 text-right text-[9px] font-semibold uppercase text-ink-muted">
            Todo el día
          </div>
          {days.map((day) => {
            const key = dateToKey(day);
            const allDay = (tasksByDate.get(key) ?? []).filter((t) => !t.startAt);
            const { blocked: isBlocked, pending: isPending } = dayStatus(key);
            return (
              <div
                key={key}
                className={cn(
                  "flex-1 border-r border-line p-1 last:border-r-0",
                  isBlocked && "bg-rose-50/40",
                  !isBlocked && isPending && "bg-amber-50/40",
                )}
              >
                {allDay.length === 0 ? (
                  <p className="py-0.5 text-center text-[9px] text-ink-muted">—</p>
                ) : (
                  <div className="space-y-0.5">
                    {allDay.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onTaskClick(t)}
                        className={cn(
                          "block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium transition-colors",
                          t.completed
                            ? "bg-green-50 text-pritio-green line-through"
                            : "bg-pritio-blue/10 text-pritio-blue hover:bg-pritio-blue/20",
                        )}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Time rows */}
        <div className="flex">
          {/* Hour labels */}
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-surface">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-[10px] font-medium text-ink-muted"
                style={{ top: h * HOUR_HEIGHT - 6 }}
              >
                {hourLabel(h, timeFormat)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const key = dateToKey(day);
            const dayTasks = tasksByDate.get(key) ?? [];
            const timed = dayTasks.filter((t) => t.startAt);
            const { blocked: isBlocked, pending: isPending } = dayStatus(key);
            const isToday = key === todayStr;

            return (
              <div
                key={key}
                className={cn(
                  "relative flex-1 border-r border-line last:border-r-0",
                  isBlocked && "bg-rose-50/40",
                  !isBlocked && isPending && "bg-amber-50/40",
                )}
              >
                <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => onSlotClick(key, `${String(h).padStart(2, "0")}:00`)}
                      aria-label={`Agregar a las ${hourLabel(h, timeFormat)}`}
                      className={cn(
                        "absolute left-0 right-0 border-b border-line/50 transition-colors hover:bg-pritio-blue/5",
                        h === 0 && "border-t-0",
                        isToday && (h === new Date().getHours()) && "bg-pritio-blue/5",
                      )}
                      style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    />
                  ))}

                  {timed.map((t) => {
                    const start = new Date(t.startAt as string);
                    const range = taskMinRange(t);
                    const live = resizing && resizing.taskId === t.id ? resizing : null;
                    const sm = live?.startMin ?? range.startMin;
                    const em = live?.endMin ?? range.endMin;
                    const top = (sm / 60) * HOUR_HEIGHT;
                    const height = Math.max(((em - sm) / 60) * HOUR_HEIGHT, 24);

                    return (
                      <div
                        key={t.id}
                        className="group absolute left-1 right-1 select-none"
                        style={{ top, height }}
                      >
                        <button
                          type="button"
                          onClick={() => onTaskClick(t)}
                          className={cn(
                            "h-full w-full overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight transition-colors",
                            t.kind === "meeting"
                              ? "border-pritio-purple/30 bg-pritio-purple/10 text-pritio-purple hover:bg-pritio-purple/20"
                              : "border-pritio-blue/30 bg-pritio-blue/10 text-pritio-blue hover:bg-pritio-blue/20",
                            t.completed && "opacity-60 line-through",
                          )}
                        >
                          {t.title}
                          <span className="block font-normal opacity-70">
                            {formatTime(start, timeFormat)}
                          </span>
                        </button>
                        <div
                          role="separator"
                          aria-label="Cambiar hora de inicio"
                          onPointerDown={(e) => handleResizeDown(e, t, key, "top")}
                          onPointerMove={handleResizeMove}
                          onPointerUp={handleResizeUp}
                          onPointerCancel={handleResizeUp}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-x-0 top-0 z-10 flex h-2 cursor-ns-resize touch-none items-end justify-center"
                        >
                          <span className="h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-40" />
                        </div>
                        <div
                          role="separator"
                          aria-label="Cambiar hora de fin"
                          onPointerDown={(e) => handleResizeDown(e, t, key, "bottom")}
                          onPointerMove={handleResizeMove}
                          onPointerUp={handleResizeUp}
                          onPointerCancel={handleResizeUp}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute inset-x-0 bottom-0 z-10 flex h-2 cursor-ns-resize touch-none items-start justify-center"
                        >
                          <span className="h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-40" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Day detail modal ─────────────────────────────── */

interface DayModalProps {
  dateStr: string;
  tasks: Task[];
  blocked: BlockedBy[];
  onClose: () => void;
  onViewDay: (dateStr: string) => void;
  onEditTask: (task: Task) => void;
}

function DayModal({ dateStr, tasks, blocked, onClose, onViewDay, onEditTask }: DayModalProps) {
  const formatted = new Date(dateStr + "T12:00:00").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const approved = blocked.filter((b) => b.status === "approved");
  const pending = blocked.filter((b) => b.status === "pending");
  const approvedLabel = approved
    .map((b) => `${b.name}${b.reason ? ` (${b.reason})` : ""}`)
    .join(", ");
  const pendingLabel = pending
    .map((b) => `${b.name}${b.reason ? ` (${b.reason})` : ""}`)
    .join(", ");

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pritio-modal-enter mx-4 w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ink capitalize">{formatted}</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {approved.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-rose-500" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="5" width="8" height="5.5" rx="1" fill="currentColor" />
              <path d="M4 5V3.5C4 2.4 4.9 1.5 6 1.5C7.1 1.5 8 2.4 8 3.5V5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <p className="text-xs font-medium text-rose-700">
              Día bloqueado por: <span className="font-semibold">{approvedLabel}</span>
            </p>
          </div>
        )}
        {pending.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 12 12" fill="none">
              <path d="M6 1.5L10.5 10H1.5L6 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M6 4.5v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="6" cy="9" r="0.7" fill="currentColor" />
            </svg>
            <p className="text-xs font-medium text-amber-700">
              Pendiente de aprobación: <span className="font-semibold">{pendingLabel}</span>
            </p>
          </div>
        )}

        {tasks.length === 0 ? (
          <p className="text-sm text-ink-soft py-4 text-center">Sin tareas este día</p>
        ) : (
          <DayTaskList tasks={tasks} onEditTask={onEditTask} />
        )}

        <button
          type="button"
          onClick={() => onViewDay(dateStr)}
          className="mt-4 w-full rounded-lg bg-pritio-blue py-2 text-xs font-semibold text-white hover:bg-pritio-blue/90 transition-colors"
        >
          Ver día completo
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ─── Shared task list ─────────────────────────────── */

function DayTaskList({
  tasks,
  onEditTask,
}: {
  tasks: Task[];
  onEditTask: (task: Task) => void;
}) {
  const timeFormat = useTimeFormat();

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="w-full rounded-xl border border-line overflow-hidden transition-colors hover:border-ink-muted/30"
        >
          <button
            type="button"
            onClick={() => onEditTask(task)}
            className="w-full p-3 text-left hover:bg-surface-muted transition-colors"
          >
            <div className="flex items-start gap-2">
              {task.kind === "meeting" && (
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-pritio-purple" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium text-ink", task.completed && "line-through text-ink-muted")}>
                  {task.title}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted capitalize">
                  {task.kind === "meeting" ? "Junta" : "Tarea"} · {task.quadrant}
                </p>
                {task.startAt && (
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {formatTime(new Date(task.startAt), timeFormat)}
                    {task.endAt && <> - {formatTime(new Date(task.endAt), timeFormat)}</>}
                  </p>
                )}
              </div>
              {task.completed && (
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-pritio-green" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </button>

          {task.kind === "meeting" && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2 bg-surface-muted/30">
              {task.location && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1.5C4 1.5 2.5 3 2.5 5C2.5 7.5 6 10.5 6 10.5C6 10.5 9.5 7.5 9.5 5C9.5 3 8 1.5 6 1.5Z" stroke="currentColor" strokeWidth="1.2" />
                      <circle cx="6" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                    Presencial
                  </span>
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(task.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-200 transition-colors max-w-[200px] truncate"
                  >
                    {task.location}
                  </a>
                </>
              )}
              {task.meetingLink && (
                <>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                      <path d="M4.5 7.5L7.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M5.5 8L4 9.5C3.5 10 2.5 10 2 9.5C1.5 9 1.5 8 2 7.5L3.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      <path d="M6.5 4L8 2.5C8.5 2 9.5 2 10 2.5C10.5 3 10.5 4 10 4.5L8.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    Virtual
                  </span>
                  <a
                    href={task.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-200 transition-colors max-w-[200px] truncate"
                  >
                    {task.meetingLink}
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
