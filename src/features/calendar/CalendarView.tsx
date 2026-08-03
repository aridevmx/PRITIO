import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn, localDateStr } from "@/lib/utils";
import { useTasks } from "@/features/tasks/useTasks";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import {
  blockedDaysEnabled,
  listWorkspaceBlockedDays,
} from "@/features/calendar/blockedDaysApi";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { Task } from "@/types";

const DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
type ViewMode = "month" | "week" | "day";

interface BlockedBy {
  userId: string;
  name: string;
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

export function CalendarView({ workspaceId, space, defaultDate }: CalendarViewProps) {
  const { profile, members } = useWorkspace();
  const timeFormat = useTimeFormat();
  const { tasks, isLoading } = useTasks(workspaceId);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [viewDate, setViewDate] = useState(() => {
    if (defaultDate) return new Date(defaultDate + "T12:00:00");
    return new Date();
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(defaultDate ?? null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [blockedByDate, setBlockedByDate] = useState<Map<string, BlockedBy[]>>(new Map());

  const weeks = useMemo(() => getMonthWeeks(viewDate), [viewDate]);
  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const date = t.dueDate ?? t.startAt;
      if (!date) return;
      const key = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dateToKey(new Date(date));
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
          const arr = map.get(r.date) ?? [];
          arr.push({ userId: r.userId, name: r.name });
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
    }));
  };

  const selectedTasks = selectedDay ? (tasksByDate.get(selectedDay) ?? []) : [];
  const selectedBlocked = selectedDay ? blockedForDay(selectedDay) : [];

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

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setTaskDialogOpen(true);
  };

  const viewFullDay = (dateStr: string) => {
    setSelectedDay(null);
    setViewMode("day");
    setViewDate(new Date(dateStr + "T12:00:00"));
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-ink-soft">Cargando...</div>;
  }

  return (
    <div className="flex gap-4 p-6">
      <div className="flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              className="rounded-lg border border-line p-1.5 text-ink-soft hover:bg-surface-muted"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-bold text-ink capitalize">{headerLabel}</h2>
            <button
              onClick={() => nav(1)}
              className="rounded-lg border border-line p-1.5 text-ink-soft hover:bg-surface-muted"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={goToday}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-muted"
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
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
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
                  const isBlocked = blockedForDay(key).length > 0;

                  return (
                    <button
                      key={di}
                      onClick={() => setSelectedDay(isSelected ? null : key)}
                      className={cn(
                        "relative min-h-[90px] border-r border-line p-2 text-left transition-colors last:border-r-0 hover:bg-surface-muted",
                        !isCurrentMonth && "bg-surface-muted/40",
                        isBlocked && "bg-rose-50/60 hover:bg-rose-100/60",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          isToday && "bg-prio-purple text-white shadow-sm",
                          isSelected && !isToday && "bg-prio-blue text-white",
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
                      <div className="mt-1 space-y-0.5">
                        {dayTasks.slice(0, 3).map((t) => (
                          <div
                            key={t.id}
                            className={cn(
                              "truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight",
                              t.completed
                                ? "bg-green-50 text-prio-green line-through"
                                : "bg-prio-blue/10 text-prio-blue",
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
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {viewMode === "week" && (
          <div className="rounded-xl border border-line bg-surface">
            <div className="grid grid-cols-7 border-b border-line">
              {weekDays.map((day, i) => {
                const key = dateToKey(day);
                const isToday = key === todayStr;
                const isBlocked = blockedForDay(key).length > 0;
                return (
                  <div key={key} className="flex items-center justify-between border-r border-line px-3 py-2 last:border-r-0">
                    <span className="text-[11px] font-bold text-ink-muted uppercase">{DAYS[i]}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDay(key)}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                        isToday ? "bg-prio-purple text-white shadow-sm" : "text-ink hover:bg-surface-muted",
                        isBlocked && !isToday && "bg-rose-100 text-rose-600 hover:bg-rose-200",
                      )}
                    >
                      {day.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-7">
              {weekDays.map((day) => {
                const key = dateToKey(day);
                const dayTasks = tasksByDate.get(key) ?? [];
                const isBlocked = blockedForDay(key).length > 0;
                const notCurrent = day.getMonth() !== viewDate.getMonth();

                return (
                  <div
                    key={key}
                    className={cn(
                      "flex min-h-[280px] flex-col gap-1 border-r border-line p-2 last:border-r-0",
                      notCurrent && "bg-surface-muted/40",
                      isBlocked && "bg-rose-50/60",
                    )}
                  >
                    {dayTasks.slice(0, 5).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => openEdit(t)}
                        className={cn(
                          "w-full rounded-lg border px-2 py-1.5 text-left transition-colors",
                          t.completed
                            ? "border-line bg-surface opacity-60"
                            : "border-line bg-surface hover:bg-surface-muted",
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          {t.kind === "meeting" && (
                            <svg className="h-3 w-3 shrink-0 text-prio-purple" viewBox="0 0 12 12" fill="none">
                              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          )}
                          <span className={cn("truncate text-xs font-medium", t.completed ? "text-ink-muted line-through" : "text-ink")}>
                            {t.title}
                          </span>
                        </div>
                        {t.startAt && (
                          <span className="text-[10px] text-ink-muted">
                            {formatTime(new Date(t.startAt), timeFormat)}
                            {t.endAt && <> - {formatTime(new Date(t.endAt), timeFormat)}</>}
                          </span>
                        )}
                      </button>
                    ))}
                    {dayTasks.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(key)}
                        className="text-left text-[11px] font-medium text-prio-blue hover:underline"
                      >
                        +{dayTasks.length - 5} más
                      </button>
                    )}
                    {dayTasks.length === 0 && !isBlocked && (
                      <p className="text-[11px] text-ink-muted">Sin tareas</p>
                    )}
                    {isBlocked && (
                      <p className="mt-auto flex items-center gap-1 text-[10px] font-medium text-rose-500">
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                          <rect x="2" y="5" width="8" height="5.5" rx="1" fill="currentColor" />
                          <path d="M4 5V3.5C4 2.4 4.9 1.5 6 1.5C7.1 1.5 8 2.4 8 3.5V5" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                        Bloqueado
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === "day" && (
          <DayView
            dateStr={dateToKey(viewDate)}
            tasks={tasksByDate.get(dateToKey(viewDate)) ?? []}
            blocked={blockedForDay(dateToKey(viewDate))}
            onEditTask={openEdit}
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
        }}
        onSaved={() => {
          setTaskDialogOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
      />
    </div>
  );
}

/* ─── Day view (inline) ─────────────────────────────── */

interface DayViewProps {
  dateStr: string;
  tasks: Task[];
  blocked: BlockedBy[];
  onEditTask: (task: Task) => void;
}

function DayView({ dateStr, tasks, blocked, onEditTask }: DayViewProps) {
  const formatted = new Date(dateStr + "T12:00:00").toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const sorted = [...tasks].sort((a, b) => {
    const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
    const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
    return ta - tb;
  });

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-base font-bold text-ink capitalize">{formatted}</h3>
        {blocked.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="5" width="8" height="5.5" rx="1" fill="currentColor" />
              <path d="M4 5V3.5C4 2.4 4.9 1.5 6 1.5C7.1 1.5 8 2.4 8 3.5V5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Bloqueado
          </span>
        )}
      </div>

      {blocked.length > 0 && (
        <div className="border-b border-rose-100 bg-rose-50/60 px-4 py-2">
          <p className="text-xs text-rose-700">
            Bloqueado por:{" "}
            <span className="font-semibold">{blocked.map((b) => b.name).join(", ")}</span>
          </p>
        </div>
      )}

      <div className="p-4">
        {sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-soft">Sin tareas este día</p>
        ) : (
          <DayTaskList tasks={sorted} onEditTask={onEditTask} />
        )}
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

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="prio-modal-enter mx-4 w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-surface p-6 shadow-elevated">
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

        {blocked.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-rose-500" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="5" width="8" height="5.5" rx="1" fill="currentColor" />
              <path d="M4 5V3.5C4 2.4 4.9 1.5 6 1.5C7.1 1.5 8 2.4 8 3.5V5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <p className="text-xs font-medium text-rose-700">
              Día bloqueado por: <span className="font-semibold">{blocked.map((b) => b.name).join(", ")}</span>
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
          className="mt-4 w-full rounded-lg bg-prio-blue py-2 text-xs font-semibold text-white hover:bg-prio-blue/90 transition-colors"
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
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-prio-purple" viewBox="0 0 12 12" fill="none">
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
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-prio-green" viewBox="0 0 12 12" fill="none">
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
