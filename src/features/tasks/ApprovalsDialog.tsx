import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { approveTask, listPendingApprovals, rejectTask } from "@/features/tasks/api";
import { notifyTaskChange } from "@/features/tasks/notifications";
import {
  approveBlockedDay,
  listPendingBlockedDays,
  rejectBlockedDay,
  type PendingBlockedDay,
} from "@/features/calendar/blockedDaysApi";
import { formatRelativeTime } from "@/features/tasks/dates";
import { useToast } from "@/components/Toast";
import type { Task } from "@/types";

const MIN_REASON_LENGTH = 5;

interface ApprovalsDialogProps {
  open: boolean;
  workspaceId: string | null;
  onClose: () => void;
}

type SectionId = "tasks" | "days";

export function ApprovalsDialog({ open, workspaceId, onClose }: ApprovalsDialogProps) {
  const { toast } = useToast();
  const [section, setSection] = useState<SectionId>("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [days, setDays] = useState<PendingBlockedDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [pendingTasks, pendingDays] = await Promise.all([
        listPendingApprovals(workspaceId),
        listPendingBlockedDays(workspaceId),
      ]);
      setTasks(pendingTasks);
      setDays(pendingDays);
      const creatorIds = Array.from(
        new Set([
          ...pendingTasks.map((t) => t.createdBy),
          ...pendingDays.map((d) => d.userId),
        ].filter(Boolean) as string[]),
      );
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", creatorIds);
        const map: Record<string, string> = {};
        (profiles ?? []).forEach((p) => {
          map[p.id as string] = (p.full_name as string) || (p.email as string) || "Usuario";
        });
        setProfileNames(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar aprobaciones");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const notifyCreator = useCallback(
    (task: Task, kind: "task_approved" | "task_rejected") => {
      if (task.createdBy && workspaceId) {
        void notifyTaskChange(kind, task.id, workspaceId, [], undefined, [task.createdBy]);
      }
    },
    [workspaceId],
  );

  async function handleApprove(task: Task) {
    setBusy(task.id);
    setError(null);
    try {
      await approveTask(task.id);
      notifyCreator(task, "task_approved");
      toast.success("Tarea aprobada");
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aprobar");
    } finally {
      setBusy(null);
    }
  }

  async function handleApproveDay(day: PendingBlockedDay) {
    if (!workspaceId) return;
    setBusy(`${day.userId}:${day.date}`);
    setError(null);
    try {
      await approveBlockedDay(workspaceId, day.userId, day.date);
      toast.success("Día aprobado");
      setDays((prev) => prev.filter((d) => !(d.userId === day.userId && d.date === day.date)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aprobar");
    } finally {
      setBusy(null);
    }
  }

  function openRejectFor(taskId: string) {
    setRejectingId(taskId);
    setReasonDraft("");
    setError(null);
  }

  async function confirmReject(task: Task) {
    const reason = reasonDraft.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      setError(`El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres.`);
      return;
    }
    setBusy(task.id);
    setError(null);
    try {
      await rejectTask(task.id, reason);
      notifyCreator(task, "task_rejected");
      toast.success("Tarea rechazada");
      setRejectingId(null);
      setReasonDraft("");
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al rechazar");
    } finally {
      setBusy(null);
    }
  }

  async function confirmRejectDay(day: PendingBlockedDay) {
    if (!workspaceId) return;
    const reason = reasonDraft.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      setError(`El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres.`);
      return;
    }
    setBusy(`${day.userId}:${day.date}`);
    setError(null);
    try {
      await rejectBlockedDay(workspaceId, day.userId, day.date, reason);
      toast.success("Día rechazado");
      setRejectingId(null);
      setReasonDraft("");
      setDays((prev) => prev.filter((d) => !(d.userId === day.userId && d.date === day.date)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al rechazar");
    } finally {
      setBusy(null);
    }
  }

  const totalPending = tasks.length + days.length;

  const summary = useMemo(() => {
    if (totalPending === 1) return "Un pendiente espera tu revisión";
    return `${totalPending} pendientes esperan tu revisión`;
  }, [totalPending]);

  if (!open) return null;

  const currentBusy = (id: string) => busy === id;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-elevated">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L14 13.5H2L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 6v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.9" fill="currentColor" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-ink">Aprobaciones</h2>
            <p className="text-xs text-ink-muted">{summary}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Secciones */}
        <div className="border-b border-line px-5 py-2.5">
          <div
            role="tablist"
            aria-label="Tipo de aprobación"
            className="flex gap-1 rounded-xl bg-surface-muted p-1"
          >
            {([
              { id: "tasks", label: `Tareas${tasks.length > 0 ? ` (${tasks.length})` : ""}` },
              { id: "days", label: `Días bloqueados${days.length > 0 ? ` (${days.length})` : ""}` },
            ] as { id: SectionId; label: string }[]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={section === tab.id}
                onClick={() => setSection(tab.id)}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  section === tab.id
                    ? "bg-white text-ink shadow-sm"
                    : "text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-ink-muted">Cargando...</p>
          ) : section === "tasks" ? (
            tasks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-muted text-ink-muted">
                  <svg className="h-6 w-6" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1.5L14 13.5H2L8 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  </svg>
                </span>
                <p className="text-sm font-semibold text-ink">Sin tareas pendientes</p>
                <p className="text-xs text-ink-muted">No hay tareas esperando tu aprobación.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {tasks.map((task) => (
                  <li key={task.id} className="rounded-xl border border-line bg-surface-muted/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-bold uppercase text-amber-700">
                            {(profileNames[task.createdBy ?? ""] ?? "?").charAt(0)}
                          </span>
                          <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
                          {task.createdBy && (
                            <span className="truncate">Enviada por {profileNames[task.createdBy] ?? "un usuario"}</span>
                          )}
                          {task.approvalRequestedAt && (
                            <span title={new Date(task.approvalRequestedAt).toLocaleString()}>
                              {formatRelativeTime(task.approvalRequestedAt)}
                            </span>
                          )}
                          {task.dueDate && <span>Vence: {task.dueDate}</span>}
                        </div>
                      </div>

                      {rejectingId !== task.id && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openRejectFor(task.id)}
                            disabled={currentBusy(task.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprove(task)}
                            disabled={currentBusy(task.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-pritio-green px-2.5 py-1.5 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-pritio-green/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Aprobar
                          </button>
                        </div>
                      )}
                    </div>

                    {rejectingId === task.id && (
                      <div className="mt-3 rounded-lg border border-red-100 bg-red-50/60 p-3">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-red-800">
                          Motivo del rechazo
                        </label>
                        <textarea
                          autoFocus
                          rows={3}
                          value={reasonDraft}
                          onChange={(e) => setReasonDraft(e.target.value)}
                          placeholder="Ej. Falta especificar el alcance, agrega un proyecto..."
                          className="mt-2 w-full resize-y rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                        />
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setRejectingId(null)}
                            disabled={currentBusy(task.id)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmReject(task)}
                            disabled={currentBusy(task.id) || reasonDraft.trim().length < MIN_REASON_LENGTH}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Confirmar rechazo
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : days.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-muted text-ink-muted">
                <svg className="h-6 w-6" viewBox="0 0 16 16" fill="none">
                  <path d="M3.5 5H12.5V13.5H3.5V5Z" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5.5 5V3.5C5.5 2.4 6.4 1.5 7.5 1.5H8.5C9.6 1.5 10.5 2.4 10.5 3.5V5" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-ink">Sin días pendientes</p>
              <p className="text-xs text-ink-muted">No hay solicitudes de días bloqueados.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {days.map((day) => {
                const dayBusy = currentBusy(`${day.userId}:${day.date}`);
                const isRejecting = rejectingId === `${day.userId}:${day.date}`;
                const formatted = new Date(`${day.date}T00:00:00`).toLocaleDateString("es-MX", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                return (
                  <li key={`${day.userId}-${day.date}`} className="rounded-xl border border-line bg-surface-muted/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-[11px] font-bold uppercase text-amber-700">
                            {(profileNames[day.userId] ?? "?").charAt(0)}
                          </span>
                          <p className="truncate text-sm font-medium text-ink capitalize">{formatted}</p>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
                          <span className="truncate">Solicitado por {day.name}</span>
                          {day.createdAt && <span>{formatRelativeTime(day.createdAt)}</span>}
                          {day.reason && <span>Motivo: {day.reason}</span>}
                        </div>
                      </div>

                      {!isRejecting && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(`${day.userId}:${day.date}`);
                              setReasonDraft("");
                              setError(null);
                            }}
                            disabled={dayBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveDay(day)}
                            disabled={dayBusy}
                            className="inline-flex items-center gap-1 rounded-lg bg-pritio-green px-2.5 py-1.5 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-pritio-green/90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Aprobar
                          </button>
                        </div>
                      )}
                    </div>

                    {isRejecting && (
                      <div className="mt-3 rounded-lg border border-red-100 bg-red-50/60 p-3">
                        <label className="block text-[11px] font-semibold uppercase tracking-wider text-red-800">
                          Motivo del rechazo
                        </label>
                        <textarea
                          autoFocus
                          rows={3}
                          value={reasonDraft}
                          onChange={(e) => setReasonDraft(e.target.value)}
                          placeholder="Ej. Ese día lo necesitamos para la entrega..."
                          className="mt-2 w-full resize-y rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                        />
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setRejectingId(null)}
                            disabled={dayBusy}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => confirmRejectDay(day)}
                            disabled={dayBusy || reasonDraft.trim().length < MIN_REASON_LENGTH}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Confirmar rechazo
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
