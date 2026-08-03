import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Shield, ShieldAlert, X } from "lucide-react";
import type {
  Assignee,
  Profile,
  Project,
  Task,
  WorkspaceRole,
  WorkspaceType,
} from "@/types";
import {
  approveTask,
  rejectTask,
} from "@/features/tasks/api";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/components/State";
import { getAssigneeNamesLabel } from "@/features/tasks/taskFilters";
import { computeApproverIds } from "@/features/tasks/approverLogic";

const MIN_REASON_LENGTH = 5;

interface ApprovalsBannerProps {
  tasks: Task[];
  assigneesById: Map<string, Assignee>;
  projectsById: Map<string, Project>;
  /**
   * ID del usuario actual. Sirve para determinar per-task si esta
   * en la lista de approvers calculada (replica de mig 0045). Si
   * no se pasa, ningun usuario podra aprobar via UI (solo lectura).
   */
  currentUserId?: string | null;
  /**
   * Es manager global del workspace (owner/admin/leader). Se usa
   * como fallback para tareas "orphan" (sin areas/participantes)
   * donde el trigger DB tambien hace fallback a managers.
   */
  canManage: boolean;
  /** Called after a task is approved/rejected so parent can refresh */
  onResolved: (task: Task) => void;
  /**
   * Profiles del workspace indexados por user_id. Sirve para resolver
   * el nombre del aprobador asignado a cada tarea (mig 0039). Opcional:
   * si no se pasa, el banner no muestra el "Aprobador: ..." pero
   * sigue funcionando.
   */
  profilesById?: Map<string, Pick<Profile, "fullName" | "email">>;
  /**
   * Mapa user_id → rol en el workspace. Necesario para calcular el
   * approver target (lead del area, sino el de mayor rango).
   */
  rolesByUserId?: Map<string, WorkspaceRole>;
  /**
   * Tipo del workspace. En "family", owner y admin tienen rank igual
   * (helper roleRankFor lo aplica). Si no se pasa, asume team.
   */
  workspaceType?: WorkspaceType | null;
}

export function ApprovalsBanner({
  tasks,
  assigneesById,
  projectsById,
  currentUserId = null,
  canManage,
  onResolved,
  profilesById,
  rolesByUserId,
  workspaceType,
}: ApprovalsBannerProps) {
  /**
   * Replica la lógica del trigger `resolve_task_approvers` (mig 0039)
   * client-side para mostrar a quién le toca aprobar cada tarea en
   * el banner. Si no se puede calcular (faltan props, área sin
   * managers, etc.) devuelve null y el banner no muestra el campo.
   *
   * Política: lead del primary si es manager activo, sino el user de
   * mayor rango entre los linkeados managers. Para empates devuelve
   * todos los del rango máximo (separados por coma).
   */
  // Mapas calculados sobre la lista actual de tasks:
  //  - approverIdsByTask: set de user ids que pueden aprobar
  //  - approverNamesByTask: string formateado para mostrar
  //  - canApproveByTask: si el current user puede aprobar ESTA tarea
  // La logica espeja resolve_task_approvers (mig 0043/0045): leads +
  // top-rank managers de areas, managers entre participantes, peer
  // cooperation cuando no hay managers. Fallback orphan: manager
  // global. Replica client-side para gateo UI per-task.
  const { approverNamesByTask, canApproveByTask } = useMemo(() => {
    const names = new Map<string, string>();
    const canApprove = new Map<string, boolean>();

    const ctx = {
      assigneesById,
      rolesByUserId: rolesByUserId ?? new Map<string, WorkspaceRole>(),
      workspaceType: workspaceType ?? null,
    };

    for (const task of tasks) {
      const set = computeApproverIds(task, ctx);

      // Names para display
      if (profilesById && set.size > 0) {
        const arr = Array.from(set)
          .map((uid) => {
            const p = profilesById.get(uid);
            return p ? (p.fullName || p.email) : null;
          })
          .filter((s): s is string => Boolean(s));
        if (arr.length > 0) {
          names.set(task.id, arr.join(", "));
        }
      }

      // Gateo per-task
      let allowed = false;
      if (currentUserId) {
        if (set.has(currentUserId)) {
          allowed = true;
        } else if (set.size === 0 && canManage) {
          // Orphan: el trigger DB hara fallback a managers globales.
          allowed = true;
        }
      }
      canApprove.set(task.id, allowed);
    }

    return {
      approverNamesByTask: names,
      canApproveByTask: canApprove,
    };
  }, [tasks, assigneesById, profilesById, rolesByUserId, workspaceType, currentUserId, canManage]);

  // ¿hay AL MENOS una tarea que el current user pueda aprobar?
  const userCanApproveAny = useMemo(() => {
    for (const v of canApproveByTask.values()) if (v) return true;
    return false;
  }, [canApproveByTask]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Estado por tarea del flujo de "rechazar con motivo".
  // - rejectingId: id de la tarea con el textarea abierto, o null
  // - reasonDraft: texto en curso para esa tarea
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");

  if (tasks.length === 0) return null;

  const visible = expanded ? tasks : tasks.slice(0, 2);
  const hiddenCount = Math.max(tasks.length - 2, 0);

  async function handleApprove(task: Task) {
    setBusy(task.id);
    setError(null);
    try {
      const updated = await approveTask(task.id);
      onResolved(updated);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  function openRejectFor(taskId: string) {
    setRejectingId(taskId);
    setReasonDraft("");
    setError(null);
  }

  function cancelReject() {
    setRejectingId(null);
    setReasonDraft("");
  }

  async function confirmReject(task: Task) {
    const reason = reasonDraft.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      setError(
        `El motivo debe tener al menos ${MIN_REASON_LENGTH} caracteres para que el autor entienda por que se rechazo.`,
      );
      return;
    }
    setBusy(task.id);
    setError(null);
    try {
      const updated = await rejectTask(task.id, reason);
      onResolved(updated);
      setRejectingId(null);
      setReasonDraft("");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 backdrop-blur-sm">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert size={14} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-amber-900">
              {tasks.length === 1
                ? "Una tarea espera aprobación"
                : `${tasks.length} tareas esperan aprobación`}
            </h3>
            <p className="mt-0.5 text-xs text-amber-800/80">
              {userCanApproveAny
                ? "Puedes aprobar o rechazar las que te corresponden."
                : "El aprobador asignado las revisara."}
            </p>
          </div>
        </div>

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-white"
          >
            {expanded ? (
              <>
                Ver menos <ChevronUp size={12} />
              </>
            ) : (
              <>
                +{hiddenCount} más <ChevronDown size={12} />
              </>
            )}
          </button>
        )}
      </header>

      <ul className="mt-3 space-y-2">
        {visible.map((task) => {
          // Multi-responsable: lista completa en orden primary-first.
          // Si son mas de 3 se trunca a "Juan, Maria, Pedro +N mas".
          const assigneesLabel = getAssigneeNamesLabel(task, assigneesById);
          const project = task.projectId
            ? projectsById.get(task.projectId)
            : null;

          const isRejecting = rejectingId === task.id;

          return (
            <li
              key={task.id}
              className="rounded-xl border border-amber-100 bg-white px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">
                    {task.title}
                  </div>
                  {(project || assigneesLabel) && (
                    <div className="mt-0.5 text-[11px] text-ink-soft">
                      {[project?.name, assigneesLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  {approverNamesByTask.get(task.id) && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                      <Shield size={10} />
                      Aprobador: {approverNamesByTask.get(task.id)}
                    </div>
                  )}
                </div>

                {canApproveByTask.get(task.id) && !isRejecting && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openRejectFor(task.id)}
                      disabled={busy === task.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-all",
                        "hover:border-red-200 hover:bg-red-50 hover:text-red-700",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                      )}
                    >
                      <X size={12} />
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(task)}
                      disabled={busy === task.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg bg-prio-green px-2.5 py-1.5 text-xs font-semibold text-white shadow-soft transition-all",
                        "hover:-translate-y-0.5 hover:bg-prio-green/90",
                        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
                      )}
                    >
                      <Check size={12} />
                      Aprobar
                    </button>
                  </div>
                )}
              </div>

              {canApproveByTask.get(task.id) && isRejecting && (
                <div className="mt-3 rounded-lg border border-red-100 bg-red-50/60 p-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-red-800">
                    Motivo del rechazo
                  </label>
                  <p className="mt-0.5 text-[11px] text-red-700/80">
                    El autor recibira una notificacion con este texto.
                  </p>
                  <textarea
                    autoFocus
                    rows={3}
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    placeholder="Ej. Falta especificar el alcance, agrega un proyecto..."
                    className={cn(
                      "mt-2 w-full resize-y rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-ink",
                      "placeholder:text-ink-muted",
                      "focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200",
                    )}
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelReject}
                      disabled={busy === task.id}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmReject(task)}
                      disabled={
                        busy === task.id ||
                        reasonDraft.trim().length < MIN_REASON_LENGTH
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition-all",
                        "hover:-translate-y-0.5 hover:bg-red-700",
                        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
                      )}
                    >
                      <X size={12} />
                      Confirmar rechazo
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </section>
  );
}
