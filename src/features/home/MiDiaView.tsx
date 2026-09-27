import { useCallback, useEffect, useMemo, useState } from "react";
import { todayStr } from "@/lib/utils";
import { useTasks } from "@/features/tasks/useTasks";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { updateTask as apiUpdateTask } from "@/features/tasks/api";
import { isOverdue } from "@/features/tasks/dates";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import {
  blockedDaysEnabled,
  listWorkspaceBlockedDays,
  type WorkspaceBlockedDay,
} from "@/features/calendar/blockedDaysApi";
import type { Task } from "@/types";

export function MiDiaView() {
  const { currentWorkspace, profile, members } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const { tasks, isLoading, updateTask: updateLocalTask, removeTask } = useTasks(
    workspaceId,
    { workspaceType: currentWorkspace?.type },
  );
  const timeFormat = useTimeFormat();

  const [blockedToday, setBlockedToday] = useState<WorkspaceBlockedDay[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const today = todayStr();
  const blockedEnabled = currentWorkspace?.type === "team" && blockedDaysEnabled("trabajo", members.length);

  useEffect(() => {
    let cancelled = false;
    if (!blockedEnabled || !workspaceId) {
      setBlockedToday([]);
      return;
    }
    (async () => {
      try {
        const rows = await listWorkspaceBlockedDays(workspaceId, today, today);
        if (cancelled) return;
        setBlockedToday(rows.filter((r) => r.status !== "rejected"));
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blockedEnabled, workspaceId, today]);

  const { overdueTasks, todayTasks, todayMeetings, myDayTasks } = useMemo(() => {
    const active = tasks.filter((t) => !t.completed);
    const overdue: Task[] = [];
    const onToday: Task[] = [];
    const meetings: Task[] = [];
    const onMyDay: Task[] = [];
    active.forEach((t) => {
      if (t.myDayDate === today && t.kind === "task") {
        onMyDay.push(t);
      }
      if (t.kind === "meeting" || t.kind === "event") {
        if (
          t.dueDate === today ||
          t.startDate === today ||
          (t.startAt && t.startAt.slice(0, 10) === today) ||
          (t.startDate && t.endDate && t.startDate <= today && t.endDate >= today)
        ) {
          meetings.push(t);
        }
        return;
      }
      if (isOverdue(t)) overdue.push(t);
      if (
        t.dueDate === today ||
        t.startDate === today ||
        (t.startDate && t.endDate && t.startDate <= today && t.endDate >= today)
      ) {
        onToday.push(t);
      }
    });
    const byTime = (a: Task, b: Task) => {
      const ta = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    };
    return {
      overdueTasks: overdue.sort(byTime),
      todayTasks: onToday.filter((t) => t.kind === "task").sort(byTime),
      todayMeetings: meetings.sort(byTime),
      myDayTasks: onMyDay.sort(byTime),
    };
  }, [tasks, today]);

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

  const openEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setDialogOpen(true);
  }, []);

  const isEmpty =
    overdueTasks.length === 0 && todayTasks.length === 0 && todayMeetings.length === 0 && myDayTasks.length === 0 && blockedToday.length === 0;

  const dateLabel = new Date().toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-pritio-blue" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-4 lg:p-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-pritio-purple">Mi día</p>
        <h1 className="text-2xl font-extrabold capitalize text-ink">{dateLabel}</h1>
        <p className="text-sm text-ink-muted">
          {myDayTasks.length + todayTasks.length + todayMeetings.length > 0
            ? `${myDayTasks.length + todayTasks.length + todayMeetings.length} cosas para hoy${
                overdueTasks.length > 0 ? ` · ${overdueTasks.length} vencidas` : ""
              }`
            : "Tu día, sin pendientes por hoy"}
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pritio-purple/10 text-pritio-purple">
            <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none">
              <path d="M10 2.5l-5.5 8.7A8 8 0 0010 17.5a8 8 0 005.5-6.3L10 2.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-base font-bold text-ink">Nada programado para hoy</h2>
          <p className="max-w-sm text-sm text-ink-muted">
            Agrega tareas a tu día desde el botón "Mi día" dentro de cada tarea. Se limpian cada 24 h para que organices cada mañana.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {myDayTasks.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-pritio-purple">Mi día</h3>
                <div className="h-px flex-1 bg-line" />
                <span className="rounded-full bg-pritio-purple/10 px-2 py-0.5 text-[11px] font-bold text-pritio-purple">
                  {myDayTasks.length}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-ink-muted">Se limpia a las 0:00 cada día.</p>
              <div className="space-y-2">
                {myDayTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onToggleComplete={handleToggleComplete} onEdit={openEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            </section>
          )}

          {overdueTasks.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-pritio-coral">Vencidas</h3>
                <div className="h-px flex-1 bg-line" />
                <span className="rounded-full bg-pritio-coral/10 px-2 py-0.5 text-[11px] font-bold text-pritio-coral">
                  {overdueTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {overdueTasks.map((t) => (
                  <TaskCard key={t.id} task={t} onToggleComplete={handleToggleComplete} onEdit={openEdit} onDelete={setDeleteTarget} />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-pritio-purple">Hoy</h3>
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4">
              {todayMeetings.length === 0 && todayTasks.length === 0 && blockedToday.length === 0 ? (
                <p className="py-3 text-center text-sm text-ink-muted">Sin tareas ni juntas para hoy.</p>
              ) : (
                <div className="space-y-4">
                  {todayMeetings.length > 0 && (
                    <div>
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-pritio-blue">
                        Juntas y eventos
                      </p>
                      <ul className="space-y-2">
                        {todayMeetings.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm"
                          >
                            <span className="shrink-0 text-[11px] font-semibold text-ink-soft">
                              {t.startAt ? formatTime(new Date(t.startAt), timeFormat) : "--:--"}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-ink">{t.title}</span>
                            <button
                              type="button"
                              onClick={() => openEdit(t)}
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
                        <TaskCard key={t.id} task={t} onToggleComplete={handleToggleComplete} onEdit={openEdit} onDelete={setDeleteTarget} />
                      ))}
                    </div>
                  )}

                  {blockedToday.length > 0 && (
                    <div className="rounded-xl border border-line bg-surface-muted px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Días bloqueados</p>
                      {blockedToday.map((b, i) => (
                        <p key={i} className="mt-1 text-sm text-ink-soft">
                          {b.name === profile?.fullName ? "Tú bloqueado" : `${b.name} está bloqueado`}
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
        </div>
      )}

      <TaskFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTask(null);
        }}
        onSaved={(saved) => {
          setDialogOpen(false);
          setEditingTask(null);
          updateLocalTask(saved);
        }}
        task={editingTask}
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