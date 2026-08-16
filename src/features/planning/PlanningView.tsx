import { useCallback, useEffect, useMemo, useState } from "react";
import { cn, localDateStr, todayStr } from "@/lib/utils";
import { useTasks } from "@/features/tasks/useTasks";
import { getWeekDays, formatDate } from "@/features/tasks/dates";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import { updateTask as apiUpdateTask } from "@/features/tasks/api";
import { blockedDaysEnabled, listWorkspaceBlockedDays } from "@/features/calendar/blockedDaysApi";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { SpaceKey } from "@/features/spaces/spaces";
import type { BlockedDayStatus, Task } from "@/types";

interface PlanningViewProps {
  workspaceId: string;
  space: SpaceKey;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function PlanningView({ workspaceId, space }: PlanningViewProps) {
  const { profile, members } = useWorkspace();
  const { tasks, isLoading, updateTask: updateLocalTask, removeTask } = useTasks(workspaceId);
  const timeFormat = useTimeFormat();

  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [blockedByDate, setBlockedByDate] = useState<Map<string, { name: string; reason: string | null; status: BlockedDayStatus }[]>>(new Map());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const weekDays = useMemo(() => getWeekDays(viewDate), [viewDate]);
  const weekStartKey = localDateStr(weekDays[0]);
  const weekEndKey = localDateStr(weekDays[6]);
  const today = todayStr();
  const blockedEnabled = blockedDaysEnabled(space, members.length);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!blockedEnabled) {
        setBlockedByDate(new Map());
        return;
      }
      try {
        const rows = await listWorkspaceBlockedDays(workspaceId, weekStartKey, weekEndKey);
        if (cancelled) return;
        const map = new Map<string, { name: string; reason: string | null; status: BlockedDayStatus }[]>();
        rows.forEach((r) => {
          if (r.status === "rejected") return;
          const arr = map.get(r.date) ?? [];
          arr.push({ name: r.name, reason: r.reason, status: r.status });
          map.set(r.date, arr);
        });
        setBlockedByDate(map);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, blockedEnabled, weekStartKey, weekEndKey]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, { meetings: Task[]; tasks: Task[] }>();
    activeTasks.forEach((t) => {
      const start =
        t.startDate ?? (t.startAt ? localDateStr(new Date(t.startAt)) : null) ?? t.dueDate;
      const end =
        t.endDate ?? (t.endAt ? localDateStr(new Date(t.endAt)) : null) ?? start;
      if (!start || !end) return;
      const cur = new Date(`${start}T12:00:00`);
      const last = new Date(`${end}T12:00:00`);
      while (cur.getTime() <= last.getTime()) {
        const key = localDateStr(cur);
        const entry = map.get(key) ?? { meetings: [], tasks: [] };
        if (t.kind === "meeting" || t.kind === "event") {
          entry.meetings.push(t);
        } else {
          entry.tasks.push(t);
        }
        map.set(key, entry);
        cur.setDate(cur.getDate() + 1);
      }
    });
    map.forEach((entry) => {
      entry.meetings.sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
        const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
        return ta - tb;
      });
      entry.tasks.sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
    });
    return map;
  }, [activeTasks]);

  const todayEntry = tasksByDay.get(today);
  const todayMeetings = todayEntry?.meetings ?? [];
  const todayTasks = todayEntry?.tasks ?? [];
  const todayBlocked = blockedByDate.get(today) ?? [];

  const weekCounts = useMemo(() => {
    let meetings = 0;
    let tasks = 0;
    let blocked = 0;
    weekDays.forEach((d) => {
      const key = localDateStr(d);
      const entry = tasksByDay.get(key);
      if (entry) {
        meetings += entry.meetings.length;
        tasks += entry.tasks.length;
      }
      blocked += (blockedByDate.get(key) ?? []).length;
    });
    return { meetings, tasks, blocked };
  }, [weekDays, tasksByDay, blockedByDate]);

  const handleToggleComplete = useCallback(
    async (task: Task) => {
      try {
        const updated = await apiUpdateTask(task.id, { completed: !task.completed });
        updateLocalTask(updated);
      } catch {
        // realtime will sync
      }
    },
    [updateLocalTask],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      try {
        await removeTask(task.id);
      } catch {
        // realtime will sync
      }
      setDeleteTarget(null);
    },
    [removeTask],
  );

  const openCreateOnDay = (dateKey: string) => {
    setEditingTask(null);
    setDialogDate(dateKey);
    setDialogOpen(true);
  };

  const nav = (delta: number) => setViewDate((d) => addDays(d, delta * 7));

  const weekLabel = (() => {
    const a = weekDays[0];
    const b = weekDays[6];
    const sameMonth = a.getMonth() === b.getMonth();
    if (sameMonth) {
      return `${a.getDate()} – ${b.getDate()} ${a.toLocaleDateString("es-MX", { month: "long" })} ${a.getFullYear()}`;
    }
    return `${a.getDate()} ${a.toLocaleDateString("es-MX", { month: "short" })} – ${b.getDate()} ${b.toLocaleDateString("es-MX", { month: "short" })} ${b.getFullYear()}`;
  })();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 p-4 lg:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => nav(-1)}
            className="rounded-lg border border-line p-2 text-ink-soft hover:bg-surface-muted"
            aria-label="Semana anterior"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-ink">{weekLabel}</h2>
          <button
            type="button"
            onClick={() => nav(1)}
            className="rounded-lg border border-line p-2 text-ink-soft hover:bg-surface-muted"
            aria-label="Semana siguiente"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewDate(new Date())}
            className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-soft hover:bg-surface-muted"
          >
            Hoy
          </button>
        </div>
        <p className="text-xs font-medium text-ink-muted">
          {weekCounts.meetings} juntas · {weekCounts.tasks} tareas{blockedEnabled ? ` · ${weekCounts.blocked} bloqueados` : ""}
        </p>
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-pritio-blue">Hoy</h3>
          <div className="h-px flex-1 bg-line" />
          <button
            type="button"
            onClick={() => openCreateOnDay(today)}
            className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-muted"
          >
            Agregar
          </button>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-4">
          {todayMeetings.length === 0 && todayTasks.length === 0 && todayBlocked.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">Nada programado para hoy.</p>
          ) : (
            <div className="space-y-4">
              {todayMeetings.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-pritio-purple">
                    Juntas y eventos
                  </p>
                  <ul className="space-y-2">
                    {todayMeetings.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm"
                      >
                        <span className="text-[11px] font-semibold text-ink-soft shrink-0">
                          {t.startAt ? formatTime(new Date(t.startAt), timeFormat) : "--:--"}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.title}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTask(t);
                            setDialogDate(null);
                            setDialogOpen(true);
                          }}
                          className="text-xs font-semibold text-pritio-blue hover:underline"
                        >
                          Editar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {todayTasks.length > 0 && (
                <div className="space-y-2">
                  {todayTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onToggleComplete={handleToggleComplete}
                      onEdit={(task) => {
                        setEditingTask(task);
                        setDialogDate(null);
                        setDialogOpen(true);
                      }}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </div>
              )}

              {todayBlocked.length > 0 && (
                <div className="rounded-xl border border-line bg-surface-muted px-3 py-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Días bloqueados</p>
                  {todayBlocked.map((b, i) => (
                    <p key={i} className="mt-1 text-sm text-ink-soft">
                      {b.name === profile?.fullName ? "Tú" : b.name}
                      {b.status === "pending" ? " (pendiente de aprobación)" : ""}
                      {b.reason ? ` — ${b.reason}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-soft">Semana</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {weekDays.map((day) => {
            const key = localDateStr(day);
            const entry = tasksByDay.get(key);
            const meetings = entry?.meetings ?? [];
            const dayTasks = entry?.tasks ?? [];
            const blocked = blockedByDate.get(key) ?? [];
            const isToday = isSameDay(day, new Date());
            const isPast = day.getTime() < new Date().setHours(0, 0, 0, 0);

            return (
              <div
                key={key}
                className={cn(
                  "flex flex-col rounded-2xl border p-3",
                  isToday ? "border-pritio-blue/50 bg-pritio-blue/5" : "border-line bg-surface",
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className={cn("text-xs font-bold uppercase tracking-wide", isToday ? "text-pritio-blue" : "text-ink-soft")}>
                      {day.toLocaleDateString("es-MX", { weekday: "short" })}
                    </p>
                    <p className={cn("text-lg font-extrabold", isToday ? "text-pritio-blue" : "text-ink", isPast && !isToday && "text-ink-muted")}>
                      {day.getDate()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreateOnDay(key)}
                    aria-label={`Agregar el ${formatDate(key)}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {blocked.length > 0 && (
                  <div className={cn("mb-2 rounded-lg px-2 py-1.5", blocked.some((b) => b.status === "pending") ? "bg-amber-50" : "bg-surface-muted")}>
                    <p className="text-[11px] font-medium text-ink-soft">
                      {blocked.map((b, i) => (
                        <span key={i} className="block">
                          {b.name === profile?.fullName ? "Tú bloqueado" : `${b.name} bloqueado`}
                          {b.status === "pending" ? " (pendiente)" : ""}
                          {b.reason ? ` — ${b.reason}` : ""}
                        </span>
                      ))}
                    </p>
                  </div>
                )}

                {meetings.length === 0 && dayTasks.length === 0 ? (
                  <p className="py-4 text-center text-xs text-ink-muted">Sin pendientes</p>
                ) : (
                  <div className="flex-1 space-y-2">
                    {meetings.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setEditingTask(t);
                          setDialogDate(null);
                          setDialogOpen(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg bg-pritio-purple/10 px-2 py-1.5 text-left text-xs"
                      >
                        <span className="shrink-0 text-[10px] font-semibold text-pritio-purple">
                          {t.startAt ? formatTime(new Date(t.startAt), timeFormat) : "--:--"}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.title}</span>
                      </button>
                    ))}
                    {dayTasks.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onToggleComplete={handleToggleComplete}
                        onEdit={(task) => {
                          setEditingTask(task);
                          setDialogDate(null);
                          setDialogOpen(true);
                        }}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <TaskFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTask(null);
          setDialogDate(null);
        }}
        onSaved={() => {
          setDialogOpen(false);
          setEditingTask(null);
          setDialogDate(null);
        }}
        task={editingTask}
        defaultDueDate={dialogDate ?? undefined}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar tarea"
        description={`¿Eliminar "${deleteTarget?.title ?? ""}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
