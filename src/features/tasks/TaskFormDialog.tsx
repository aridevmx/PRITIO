import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn, todayStr, localDateStr } from "@/lib/utils";
import { Field } from "@/components/Field";
import { SegmentedControl } from "@/components/SegmentedControl";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { createTask as apiCreateTask, updateTask as apiUpdateTask } from "@/features/tasks/api";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import type { Task, Quadrant, TaskKind, CreateTaskPayload } from "@/types";

const MEETING_DURATIONS = [15, 30, 45, 60] as const;
type MeetingDuration = (typeof MEETING_DURATIONS)[number];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  task?: Task | null;
  defaultQuadrant?: Quadrant;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function meetingStartISO(day: string, time: string): string | null {
  if (!day || !time) return null;
  const d = new Date(`${day}T${time}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function meetingEndISO(day: string, time: string, duration: MeetingDuration): string | null {
  if (!day || !time) return null;
  const d = new Date(`${day}T${time}`);
  d.setMinutes(d.getMinutes() + duration);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function snapTo5(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  const snapped = Math.round(m / 5) * 5;
  const minute = snapped === 60 ? 0 : snapped;
  let hour = snapped === 60 ? h + 1 : h;
  if (hour === 24) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function TaskFormDialog({
  open,
  onClose,
  onSaved,
  task,
  defaultQuadrant = "do",
}: TaskFormDialogProps) {
  const { currentWorkspace, profile } = useWorkspace();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [quadrant, setQuadrant] = useState<Quadrant>(defaultQuadrant);
  const [kind, setKind] = useState<TaskKind>("task");
  const [dueDate, setDueDate] = useState("");
  const [meetingDay, setMeetingDay] = useState("");
  const [meetingStartTime, setMeetingStartTime] = useState("");
  const [meetingDuration, setMeetingDuration] = useState<MeetingDuration>(30);
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const timeFormat = useTimeFormat();

  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    supabase
      .from("assignees")
      .select("id, name")
      .eq("workspace_id", currentWorkspace.id)
      .then(({ data }) => setAssignees(data ?? []));
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    supabase
      .from("projects")
      .select("id, name, color")
      .eq("workspace_id", currentWorkspace.id)
      .then(({ data }) => setProjects(data ?? []));
  }, [currentWorkspace?.id]);

  const titleRef = useRef<HTMLInputElement>(null);

  const isEdit = !!task;

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description ?? "");
        setShowDescription(!!task.description);
        setQuadrant(task.quadrant);
        setKind(task.kind);
        setDueDate(task.dueDate ?? "");
        if (task.startAt) {
          const start = new Date(task.startAt);
          setMeetingDay(localDateStr(start));
          setMeetingStartTime(
            snapTo5(start.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })),
          );
          const minutes = task.endAt ? Math.round((new Date(task.endAt).getTime() - start.getTime()) / 60000) : 30;
          const clamped = MEETING_DURATIONS.reduce(
            (best, d) => (Math.abs(d - minutes) < Math.abs(best - minutes) ? d : best),
            MEETING_DURATIONS[0],
          );
          setMeetingDuration(clamped);
        } else {
          setMeetingDay(task.dueDate ?? "");
          setMeetingStartTime("");
          setMeetingDuration(30);
        }
        setLocation(task.location ?? "");
        setMeetingLink(task.meetingLink ?? "");
        setRequiresApproval(task.requiresApproval);
        setProjectId(task.projectId ?? "");
        setSelectedAssigneeIds(task.assigneeIds);
      } else {
        setTitle("");
        setDescription("");
        setShowDescription(false);
        setQuadrant(defaultQuadrant);
        setKind("task");
        setDueDate("");
        setMeetingDay("");
        setMeetingStartTime("");
        setMeetingDuration(30);
        setLocation("");
        setMeetingLink("");
        setRequiresApproval(false);
        setProjectId("");
        setSelectedAssigneeIds([]);
      }
      setError("");
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, task, defaultQuadrant]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [open, handleKeyDown]);

  const toggleAssignee = (id: string) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError("El titulo es requerido");
      return;
    }
    if (kind === "meeting" && meetingStartTime && !meetingDay) {
      setError("Indica el día de la junta");
      return;
    }
    if (!currentWorkspace || !profile) {
      setError("No hay workspace o perfil disponible. Cierra sesion y vuelve a entrar.");
      return;
    }

    setSaving(true);
    setError("");

    const effectiveDueDate = kind === "meeting" ? (meetingDay || null) : (dueDate || null);
    const effectiveStartAt = kind === "meeting" ? meetingStartISO(meetingDay, meetingStartTime) : null;
    const effectiveEndAt = kind === "meeting" ? meetingEndISO(meetingDay, meetingStartTime, meetingDuration) : null;

    try {
      let saved: Task;
      if (isEdit) {
        saved = await apiUpdateTask(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          quadrant,
          kind,
          dueDate: effectiveDueDate,
          startAt: effectiveStartAt,
          endAt: effectiveEndAt,
          location: location.trim() || null,
          meetingLink: meetingLink.trim() || null,
          requiresApproval,
          projectId: projectId || null,
          assigneeIds: selectedAssigneeIds,
        });
      } else {
        const payload: CreateTaskPayload = {
          workspaceId: currentWorkspace.id,
          title: title.trim(),
          description: description.trim() || null,
          quadrant,
          kind,
          dueDate: effectiveDueDate,
          startAt: effectiveStartAt,
          endAt: effectiveEndAt,
          location: location.trim() || null,
          meetingLink: meetingLink.trim() || null,
          requiresApproval,
          projectId: projectId || null,
          assigneeIds: selectedAssigneeIds,
          createdBy: profile.id,
        };
        saved = await apiCreateTask(payload);
      }
      onSaved(saved);
      toast.success(
        isEdit
          ? kind === "meeting" ? "Junta actualizada" : "Tarea actualizada"
          : kind === "meeting" ? "Junta creada" : "Tarea creada",
      );
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [
    title, description, quadrant, kind, dueDate, meetingDay, meetingStartTime, meetingDuration,
    location, meetingLink, requiresApproval, projectId, selectedAssigneeIds,
    currentWorkspace, profile, isEdit, task, onSaved, onClose, toast,
  ]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="prio-modal-enter mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-elevated">
        <h3 className="text-lg font-bold text-ink">
          {isEdit ? "Editar tarea" : "Nueva tarea"}
        </h3>

        <div className="mt-5 space-y-4">
          <SegmentedControl
            value={kind}
            pill
            onChange={(k) => {
              setKind(k);
              if (k === "task") {
                if (!dueDate && meetingDay) setDueDate(meetingDay);
              } else {
                if (!meetingDay && dueDate) setMeetingDay(dueDate);
              }
            }}
            options={[
              {
                value: "task",
                label: "Tarea",
                activeClassName: "text-prio-blue",
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M2.5 4.5l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2.5 9l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="10" y="4.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                    <rect x="10" y="9.5" width="3.5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                ),
              },
              {
                value: "meeting",
                label: "Junta",
                activeClassName: "text-prio-purple",
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ),
              },
            ]}
          />

          <Field label="Titulo" error={error}>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError("");
              }}
              placeholder="Ej: Revisar propuesta de proyecto"
              className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-prio-blue focus:outline-none focus:ring-2 focus:ring-prio-blue/20"
            />
          </Field>

          {showDescription ? (
            <Field label="Descripcion">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles adicionales..."
                rows={3}
                className="w-full resize-none rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-prio-blue focus:outline-none focus:ring-2 focus:ring-prio-blue/20"
              />
            </Field>
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Añadir Descripción
            </button>
          )}

          <Field label="Cuadrante">
            <div className="grid grid-cols-4 gap-2">
              {QUADRANT_ORDER.map((qKey) => {
                const meta = QUADRANTS[qKey];
                const isActive = quadrant === qKey;
                return (
                  <button
                    key={qKey}
                    type="button"
                    onClick={() => setQuadrant(qKey)}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-xl border-2 px-2.5 py-2 text-left transition-all",
                      isActive
                        ? cn(meta.classes.borderStrong, meta.classes.softBg, meta.classes.accentText)
                        : cn(meta.classes.border, "bg-surface hover:bg-surface-muted"),
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", meta.classes.accentBg)} />
                    <span className="text-xs font-semibold leading-tight">{meta.title}</span>
                    <span className={cn("text-[10px] leading-tight", isActive ? "opacity-90" : "text-ink-muted")}>
                      {meta.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {kind === "task" && (
              <Field label="Fecha limite" badge="Opcional">
                <div className="flex flex-col gap-1.5">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-prio-blue focus:outline-none focus:ring-2 focus:ring-prio-blue/20"
                  />
                  <div className="flex gap-1">
                    {[
                      { label: "Hoy", value: todayStr() },
                      { label: "Mañana", value: addDays(1) },
                      { label: "1 sem", value: addDays(7) },
                    ].map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => setDueDate(s.value)}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all",
                          dueDate === s.value
                            ? "border-prio-blue bg-prio-blue/5 text-prio-blue"
                            : "border-line text-ink-soft hover:bg-surface-muted",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
            )}

          {/* Project + Approval row */}
          {projects.length > 0 && (
            <Field label="Proyecto" badge="Opcional">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-prio-blue focus:outline-none focus:ring-2 focus:ring-prio-blue/20"
              >
                <option value="">Sin proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Meeting fields */}
          {kind === "meeting" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Día de la junta">
                  <input
                    type="date"
                    value={meetingDay}
                    onChange={(e) => setMeetingDay(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-prio-purple focus:outline-none focus:ring-2 focus:ring-prio-purple/20"
                  />
                </Field>
                <Field label="Hora de inicio">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={meetingStartTime ? meetingStartTime.slice(0, 2) : ""}
                      onChange={(e) => {
                        const h = e.target.value;
                        const m = meetingStartTime ? meetingStartTime.slice(3, 5) : "";
                        if (!h) setMeetingStartTime("");
                        else setMeetingStartTime(m ? `${h}:${m}` : `${h}:00`);
                      }}
                      className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-prio-purple focus:outline-none focus:ring-2 focus:ring-prio-purple/20"
                    >
                      <option value="">--</option>
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <span className="text-sm font-semibold text-ink-soft">:</span>
                    <select
                      value={meetingStartTime ? meetingStartTime.slice(3, 5) : ""}
                      onChange={(e) => {
                        const m = e.target.value;
                        const h = meetingStartTime ? meetingStartTime.slice(0, 2) : "";
                        if (!m) setMeetingStartTime("");
                        else setMeetingStartTime(h ? `${h}:${m}` : `00:${m}`);
                      }}
                      className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-prio-purple focus:outline-none focus:ring-2 focus:ring-prio-purple/20"
                    >
                      <option value="">--</option>
                      {MINUTE_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </Field>
              </div>
              <Field label="Duración">
                <div className="flex gap-1.5">
                  {MEETING_DURATIONS.map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setMeetingDuration(dur)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-semibold transition-all",
                        meetingDuration === dur
                          ? "border-prio-purple bg-prio-purple text-white"
                          : "border-line bg-surface text-ink-soft hover:bg-surface-muted",
                      )}
                    >
                      {dur} m
                    </button>
                  ))}
                </div>
              </Field>
              {meetingDay && meetingStartTime && (
                <p className="-mt-1.5 text-xs text-ink-soft">
                  Fin:{" "}
                  {(() => {
                    const end = new Date(`${meetingDay}T${meetingStartTime}`);
                    end.setMinutes(end.getMinutes() + meetingDuration);
                    return formatTime(end, timeFormat);
                  })()}
                  {" · "}
                  {meetingDuration} min
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Dirección / Lugar" badge="Opcional">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Ej: Sala B, Edificio Principal"
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-prio-purple focus:outline-none focus:ring-2 focus:ring-prio-purple/20"
                  />
                </Field>
                <Field label="Enlace de la junta" badge="Opcional">
                  <input
                    type="url"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-prio-purple focus:outline-none focus:ring-2 focus:ring-prio-purple/20"
                  />
                </Field>
              </div>
            </>
          )}

          {/* Multi-assignee */}
          {assignees.length > 0 && (
            <Field label="Asignar a" badge="Opcional">
              <div className="flex flex-wrap gap-1.5">
                {selectedAssigneeIds.map((id) => {
                  const a = assignees.find((x) => x.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-prio-blue/10 px-2.5 py-1 text-xs font-medium text-prio-blue"
                    >
                      {a?.name ?? id}
                      <button
                        type="button"
                        onClick={() => toggleAssignee(id)}
                        className="ml-0.5 text-prio-blue/60 hover:text-prio-blue"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                          <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  );
                })}
              </div>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) toggleAssignee(e.target.value);
                }}
                className="mt-1.5 w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-prio-blue focus:outline-none focus:ring-2 focus:ring-prio-blue/20"
              >
                <option value="">Agregar asignado...</option>
                {assignees
                  .filter((a) => !selectedAssigneeIds.includes(a.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
              </select>
            </Field>
          )}

          {/* Approval checkbox (only when workspace has members) */}
          {assignees.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="h-4 w-4 rounded border-line text-prio-blue focus:ring-prio-blue/20"
              />
              Requiere aprobacion
            </label>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-xl bg-prio-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-prio-blue/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
