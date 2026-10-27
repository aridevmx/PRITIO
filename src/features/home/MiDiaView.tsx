import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { useTasks } from "@/features/tasks/useTasks";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { TaskCard } from "@/features/tasks/TaskCard";
import { TaskFormDialog } from "@/features/tasks/TaskFormDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { updateTask as apiUpdateTask } from "@/features/tasks/api";
import { isOverdue } from "@/features/tasks/dates";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import { emitAppEvent } from "@/lib/appEvents";
import type { CreateTaskDialogOptions } from "@/features/tasks/AddTaskDialog";
import {
  blockedDaysEnabled,
  listWorkspaceBlockedDays,
  type WorkspaceBlockedDay,
} from "@/features/calendar/blockedDaysApi";
import type { Task } from "@/types";
import { getMiDiaToday, getMiDiaStartOfDay } from "@/features/home/miDiaSettings";

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
  const [quickAdd, setQuickAdd] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(true);

  const today = getMiDiaToday(currentWorkspace);
  const startOfDay = getMiDiaStartOfDay(currentWorkspace);
  const resetTime = currentWorkspace?.myDayResetTime ?? "00:00";
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

  // Sugerencias: pendientes que todavía no están en Mi día (vencidas, con
  // fecha de hoy o que ya estaban agendadas para otro día).
  const suggestions = useMemo(() => {
    const onMyDayIds = new Set(myDayTasks.map((t) => t.id));
    const startOfDayStr = startOfDay.toISOString().split("T")[0];
    const cands = tasks.filter(
      (t) =>
        t.kind === "task" &&
        !t.completed &&
        !onMyDayIds.has(t.id) &&
        (isOverdue(t) ||
          t.startDate === startOfDayStr ||
          t.dueDate === startOfDayStr ||
          (t.startDate && t.endDate && t.startDate <= startOfDayStr && t.endDate >= startOfDayStr) ||
          (t.myDayDate !== null && t.myDayDate !== today)),
    );
    return cands.slice(0, 8);
  }, [tasks, myDayTasks, today, startOfDay]);

  const handleAddToMyDay = useCallback(
    async (task: Task) => {
      try {
        const updated = await apiUpdateTask(task.id, { myDayDate: today });
        updateLocalTask(updated);
      } catch {
        // realtime will sync
      }
    },
    [updateLocalTask, today],
  );

  const handleQuickAdd = (e: FormEvent) => {
    e.preventDefault();
    const title = quickAdd.trim();
    if (!title) return;
    setQuickAdd("");
    emitAppEvent<CreateTaskDialogOptions>("pritio:create-task", { title, myDay: true });
  };

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

  const dateLabel = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    return date.toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  })();

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

      <form
        onSubmit={handleQuickAdd}
        className="mb-6"
      >
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface/75 py-1 pl-4 pr-1 shadow-elevated backdrop-blur-xl transition-colors focus-within:border-pritio-purple focus-within:ring-2 focus-within:ring-pritio-purple/25">
          <svg
            className="h-4 w-4 shrink-0 text-ink-muted"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            placeholder="Captura algo para tu día…"
            aria-label="Captura rápida para Mi día"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            disabled={!quickAdd.trim()}
            aria-label="Crear tarea en Mi día"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pritio-purple text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 active:scale-95"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M5 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      {suggestions.length > 0 && (
        <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface/60">
          <button
            type="button"
            onClick={() => setShowSuggestions((v) => !v)}
            aria-expanded={showSuggestions}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
          >
            <svg
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform duration-200",
                !showSuggestions && "-rotate-90",
              )}
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
            >
              <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-bold uppercase tracking-wider text-pritio-purple">Sugeridos</span>
            <span className="rounded-full bg-pritio-purple/10 px-2 py-0.5 text-[11px] font-bold text-pritio-purple">
              {suggestions.length}
            </span>
          </button>
          {showSuggestions && (
            <div className="border-t border-line">
              <ul className="divide-y divide-line/70">
                {suggestions.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                      <p className="text-[11px] text-ink-muted">
                        {isOverdue(t)
                          ? "Vencida"
                          : t.dueDate === today || t.startDate === today
                            ? "Para hoy"
                            : t.myDayDate
                              ? `Agendada para ${new Date(t.myDayDate).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`
                              : "Sin fecha"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddToMyDay(t)}
                      className="shrink-0 rounded-full border border-pritio-purple/40 bg-pritio-purple/10 px-3 py-1 text-xs font-semibold text-pritio-purple transition-colors hover:bg-pritio-purple hover:text-white"
                    >
                      Añadir a hoy
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

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
              <p className="mb-2 text-[11px] text-ink-muted">Se limpia a las {resetTime} cada día.</p>
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