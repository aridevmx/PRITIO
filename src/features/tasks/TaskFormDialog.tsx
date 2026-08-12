import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn, todayStr, localDateStr } from "@/lib/utils";
import { Field } from "@/components/Field";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TimePicker } from "@/components/TimePicker";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { createTask as apiCreateTask, updateTask as apiUpdateTask } from "@/features/tasks/api";
import { useBilling } from "@/features/billing/BillingProvider";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import { notifyTaskChange } from "@/features/tasks/notifications";
import { RecurrenceEditDialog } from "@/features/tasks/RecurrenceEditDialog";
import type { Task, Quadrant, TaskKind, RecurrenceFreq, CreateTaskPayload } from "@/types";

const MEETING_DURATIONS = [15, 30, 45, 60] as const;
type MeetingDuration = (typeof MEETING_DURATIONS)[number];

interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  task?: Task | null;
  defaultQuadrant?: Quadrant;
  defaultDueDate?: string;
  defaultStartTime?: string;
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
  const start = new Date(`${day}T${time}`);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + duration);
  if (isNaN(end.getTime())) return null;
  const dayEnd = new Date(`${day}T23:59`);
  if (end.getTime() > dayEnd.getTime()) return dayEnd.toISOString();
  return end.toISOString();
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

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

export function TaskFormDialog({
  open,
  onClose,
  onSaved,
  task,
  defaultQuadrant = "do",
  defaultDueDate,
  defaultStartTime,
}: TaskFormDialogProps) {
  const { currentWorkspace, profile, members } = useWorkspace();
  const { canCreate, hasFeature } = useBilling();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [quadrant, setQuadrant] = useState<Quadrant>(defaultQuadrant);
  const [kind, setKind] = useState<TaskKind>("task");
  const [dueDate, setDueDate] = useState("");
  const [blockDay, setBlockDay] = useState("");
  const [meetingDay, setMeetingDay] = useState("");
  const [meetingStartTime, setMeetingStartTime] = useState("");
  const [meetingDuration, setMeetingDuration] = useState<MeetingDuration>(30);
  const [taskStartTime, setTaskStartTime] = useState("");
  const [taskEndTime, setTaskEndTime] = useState("");
  const [showTaskTime, setShowTaskTime] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq | "">("");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceChoice, setRecurrenceChoice] = useState<"this" | "all" | null>(null);
  const [recurrencePromptOpen, setRecurrencePromptOpen] = useState(false);
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

  const canShowMeetings = hasFeature("meetings") || (isEdit && task?.kind === "meeting");
  const showDueDate = hasFeature("due_date") || (isEdit && !!task?.dueDate);

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description ?? "");
        setShowDescription(!!task.description);
        setQuadrant(task.quadrant);
        setKind(task.kind);
        setDueDate(task.dueDate ?? "");
        setBlockDay("");
        setTaskStartTime("");
        setTaskEndTime("");
        setShowTaskTime(false);
        if (task.startAt) {
          const start = new Date(task.startAt);
          const time = snapTo5(
            start.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }),
          );
          const endTime = task.endAt
            ? snapTo5(
                new Date(task.endAt).toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }),
              )
            : "";
          const minutes = task.endAt
            ? Math.round((new Date(task.endAt).getTime() - start.getTime()) / 60000)
            : 30;
          const clamped = MEETING_DURATIONS.reduce(
            (best, d) => (Math.abs(d - minutes) < Math.abs(best - minutes) ? d : best),
            MEETING_DURATIONS[0],
          );
          if (task.kind === "meeting") {
            setMeetingDay(localDateStr(start));
            setMeetingStartTime(time);
            setMeetingDuration(clamped);
            setMeetingLink(task.meetingLink ?? "");
          } else {
            setMeetingDay("");
            setMeetingStartTime("");
            setMeetingDuration(30);
            setBlockDay(localDateStr(start));
            setTaskStartTime(time);
            setTaskEndTime(endTime);
            setShowTaskTime(true);
            setMeetingLink("");
          }
        } else {
          setMeetingDay(task.dueDate ?? "");
          setMeetingStartTime("");
          setMeetingDuration(30);
          setMeetingLink(task.meetingLink ?? "");
        }
        setLocation(task.location ?? "");
        setRequiresApproval(task.requiresApproval);
        setProjectId(task.projectId ?? "");
        setSelectedAssigneeIds(task.assigneeIds);
        setRecurrenceFreq(task.recurrenceFreq ?? "");
        setRecurrenceInterval(task.recurrenceInterval || 1);
        setRecurrenceEndDate(task.recurrenceEndDate ?? "");
        setRecurrenceChoice(null);
      } else {
        setTitle("");
        setDescription("");
        setShowDescription(false);
        setQuadrant(defaultQuadrant);
        setKind("task");
        setDueDate(defaultStartTime ? "" : (defaultDueDate ?? ""));
        setBlockDay(defaultStartTime ? (defaultDueDate ?? "") : "");
        setMeetingDay("");
        setMeetingStartTime("");
        setMeetingDuration(30);
        setTaskStartTime(defaultStartTime ?? "");
        setTaskEndTime("");
        setShowTaskTime(!!defaultStartTime);
        setLocation("");
        setMeetingLink("");
        setRequiresApproval(false);
        setProjectId("");
        setSelectedAssigneeIds([]);
        setRecurrenceFreq("");
        setRecurrenceInterval(1);
        setRecurrenceEndDate("");
        setRecurrenceChoice(null);
      }
      setError("");
      setShowMore(false);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, task, defaultQuadrant, defaultDueDate, defaultStartTime]);

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

  const performSave = useCallback(async (choice: "this" | "all" | null) => {
    if (!title.trim()) {
      setError("El titulo es requerido");
      return;
    }
    if (kind === "meeting" && meetingStartTime && !meetingDay) {
      setError("Indica el día de la junta");
      return;
    }
    if (kind === "task" && taskStartTime && !blockDay) {
      setError("Indica el día del bloque de tiempo");
      return;
    }
    if (kind === "task" && taskStartTime && !taskEndTime) {
      setError("Indica la hora de fin del bloque");
      return;
    }
    if (
      kind === "task" &&
      taskStartTime &&
      taskEndTime &&
      timeToMinutes(taskEndTime) <= timeToMinutes(taskStartTime)
    ) {
      setError("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    if (!currentWorkspace || !profile) {
      setError("No hay workspace o perfil disponible. Cierra sesion y vuelve a entrar.");
      return;
    }

    setSaving(true);
    setError("");
    setRecurrencePromptOpen(false);

    const effectiveDueDate = kind === "meeting" ? (meetingDay || null) : (dueDate || null);
    const effectiveStartAt =
      kind === "meeting"
        ? meetingStartISO(meetingDay, meetingStartTime)
        : meetingStartISO(blockDay, taskStartTime);
    const effectiveEndAt =
      kind === "meeting"
        ? meetingEndISO(meetingDay, meetingStartTime, meetingDuration)
        : meetingStartISO(blockDay, taskEndTime);

    const effectiveFreq: RecurrenceFreq | null =
      choice === "this" ? null : recurrenceFreq === "" ? null : recurrenceFreq;

    const resubmitting = isEdit && requiresApproval && Boolean(task?.rejected);
    const newlyRequiring = isEdit && requiresApproval && !task?.requiresApproval;
    const approvalRequestedAt = !requiresApproval
      ? null
      : isEdit && !resubmitting && !newlyRequiring
        ? (task?.approvalRequestedAt ?? null)
        : new Date().toISOString();

    const managerUserIds = members
      .filter(
        (m) =>
          m.userId !== profile.id &&
          (m.role === "owner" || m.role === "admin" || m.role === "leader"),
      )
      .map((m) => m.userId);

    const shouldNotifyApproval =
      requiresApproval && (!isEdit || newlyRequiring || resubmitting);

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
          approved: resubmitting ? false : undefined,
          rejected: resubmitting ? false : undefined,
          rejectionReason: resubmitting ? null : undefined,
          approvalRequestedAt,
          projectId: projectId || null,
          assigneeIds: selectedAssigneeIds,
          recurrenceFreq: effectiveFreq,
          recurrenceInterval: recurrenceFreq === "" ? 1 : recurrenceInterval,
          recurrenceEndDate: recurrenceFreq === "" ? null : recurrenceEndDate || null,
          recurrenceCount: null,
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
          approvalRequestedAt,
          projectId: projectId || null,
          assigneeIds: selectedAssigneeIds,
          recurrenceFreq: effectiveFreq,
          recurrenceInterval: recurrenceFreq === "" ? 1 : recurrenceInterval,
          recurrenceEndDate: recurrenceFreq === "" ? null : recurrenceEndDate || null,
          createdBy: profile.id,
        };
        if (!canCreate("active_tasks")) return;
        saved = await apiCreateTask(payload);
      }

      if (isEdit) {
        const assigneesChanged =
          selectedAssigneeIds.length !== (task?.assigneeIds.length ?? 0) ||
          selectedAssigneeIds.some((id) => !task?.assigneeIds.includes(id));
        if (assigneesChanged) {
          void notifyTaskChange("assigned", saved.id, currentWorkspace.id, selectedAssigneeIds);
        } else {
          void notifyTaskChange("updated", saved.id, currentWorkspace.id, selectedAssigneeIds);
        }
      } else if (kind === "meeting") {
        void notifyTaskChange("meeting_created", saved.id, currentWorkspace.id, selectedAssigneeIds);
      } else if (selectedAssigneeIds.length > 0) {
        void notifyTaskChange("assigned", saved.id, currentWorkspace.id, selectedAssigneeIds);
      }

      if (shouldNotifyApproval && managerUserIds.length > 0) {
        void notifyTaskChange("approval_requested", saved.id, currentWorkspace.id, [], undefined, managerUserIds);
      }

      onSaved(saved);
      toast.success(
        isEdit
          ? kind === "meeting" ? "Junta actualizada" : "Tarea actualizada"
          : kind === "meeting" ? "Junta creada" : "Tarea creada",
      );
      onClose();
    } catch (err) {
      const resource = parsePlanLimitError(err);
      if (resource) {
        openUpgrade(resource);
        return;
      }
      const msg = err instanceof Error ? err.message : "Error al guardar";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [
    title, description, quadrant, kind, dueDate, blockDay, meetingDay, meetingStartTime, meetingDuration,
    taskStartTime, taskEndTime, location, meetingLink, requiresApproval, projectId, selectedAssigneeIds,
    recurrenceFreq, recurrenceInterval, recurrenceEndDate, currentWorkspace, profile, members, isEdit, task,
    canCreate, onSaved, onClose, toast,
  ]);

  const handleSubmit = useCallback(async () => {
    if (isEdit && task?.recurrenceFreq && recurrenceChoice === null) {
      setRecurrencePromptOpen(true);
      return;
    }
    await performSave(recurrenceChoice);
  }, [isEdit, task, recurrenceChoice, performSave]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-ink/30 backdrop-blur-sm md:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pritio-modal-enter max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-b-0 border-line bg-surface p-5 shadow-elevated md:mx-4 md:max-h-[90vh] md:max-w-lg md:rounded-b-2xl md:border-b md:p-6">
        <h3 className="text-lg font-bold text-ink">
          {isEdit ? "Editar tarea" : "Nueva tarea"}
        </h3>

        <div className="mt-5 space-y-4">
          {canShowMeetings && (
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
                  activeClassName: "text-pritio-blue",
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
                  activeClassName: "text-pritio-purple",
                  icon: (
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ),
                },
              ]}
            />
          )}

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
              className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
            />
          </Field>

          {showDescription ? (
            <Field label="Descripcion">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles adicionales..."
                rows={3}
                className="w-full resize-none rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
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

          {kind === "task" && showDueDate && (
            <Field label="Fecha limite" badge="Opcional">
              <div className="flex flex-col gap-1.5">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
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
                          ? "border-pritio-blue bg-pritio-blue/5 text-pritio-blue"
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

          {/* Meeting fields */}
          {kind === "meeting" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Día de la junta">
                  <input
                    type="date"
                    value={meetingDay}
                    onChange={(e) => setMeetingDay(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-pritio-purple focus:outline-none focus:ring-2 focus:ring-pritio-purple/20"
                  />
                </Field>
                <Field label="Hora de inicio">
                  <TimePicker value={meetingStartTime} onChange={setMeetingStartTime} accent="purple" />
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
                          ? "border-pritio-purple bg-pritio-purple text-white"
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
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-purple focus:outline-none focus:ring-2 focus:ring-pritio-purple/20"
                  />
                </Field>
                <Field label="Enlace de la junta" badge="Opcional">
                  <input
                    type="url"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-purple focus:outline-none focus:ring-2 focus:ring-pritio-purple/20"
                  />
                </Field>
              </div>
            </>
          )}

          {/* Project + Assignee row (2 columns) */}
          {(projects.length > 0 || assignees.length > 0) && (
            <div
              className={cn(
                "grid gap-4",
                projects.length > 0 && assignees.length > 0
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1",
              )}
            >
              {projects.length > 0 && (
                <Field label="Proyecto" badge="Opcional">
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                  >
                    <option value="">Sin proyecto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </Field>
              )}

              {assignees.length > 0 && (
                <Field label="Asignar a" badge="Opcional">
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAssigneeIds.map((id) => {
                      const a = assignees.find((x) => x.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full bg-pritio-blue/10 px-2.5 py-1 text-xs font-medium text-pritio-blue"
                        >
                          {a?.name ?? id}
                          <button
                            type="button"
                            onClick={() => toggleAssignee(id)}
                            className="ml-0.5 text-pritio-blue/60 hover:text-pritio-blue"
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
                    className="mt-1.5 w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
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
            </div>
          )}

          {/* Approval checkbox (only when workspace has members) */}
          {assignees.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                className="h-4 w-4 rounded border-line text-pritio-blue focus:ring-pritio-blue/20"
              />
              Requiere aprobacion
            </label>
          )}

          {/* Optional sections */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              {showMore ? (
                <path d="M4 8h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
            {showMore ? "- Menos Opciones" : "+ Mas Opciones"}
          </button>

          {showMore && (
            <div className="space-y-4">
              {kind === "task" &&
                (showTaskTime ? (
                  <>
                    <Field label="Fecha">
                      <input
                        type="date"
                        value={blockDay}
                        onChange={(e) => setBlockDay(e.target.value)}
                        className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                      />
                    </Field>
                    <Field label="Horario">
                      <div className="flex items-center gap-2">
                        <TimePicker value={taskStartTime} onChange={setTaskStartTime} accent="blue" compact />
                        <span className="text-sm font-semibold text-ink-soft">a</span>
                        <TimePicker value={taskEndTime} onChange={setTaskEndTime} accent="blue" compact />
                      </div>
                    </Field>
                    <button
                      type="button"
                      onClick={() => {
                        setShowTaskTime(false);
                        setTaskStartTime("");
                        setTaskEndTime("");
                        setBlockDay("");
                      }}
                      className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                      Quitar bloque
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTaskTime(true)}
                    className="flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink transition-colors"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    Agregar bloque de tiempo
                  </button>
                ))}

              {/* Recurrence */}
              <div className="rounded-xl border border-line bg-surface-subtle/60 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Repetir</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "", label: "No" },
                    { value: "daily", label: "Diario" },
                    { value: "weekly", label: "Semanal" },
                    { value: "monthly", label: "Mensual" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRecurrenceFreq(opt.value as RecurrenceFreq | "")}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                        recurrenceFreq === opt.value
                          ? "border-pritio-blue bg-pritio-blue text-white"
                          : "border-line bg-surface text-ink-soft hover:bg-surface-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {recurrenceFreq && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Cada">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={recurrenceInterval}
                        onChange={(e) => setRecurrenceInterval(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                      />
                    </Field>
                    <Field label="Hasta" badge="Opcional">
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </div>
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
            className="rounded-xl bg-pritio-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-pritio-blue/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </div>
      <RecurrenceEditDialog
        open={recurrencePromptOpen}
        title={title}
        onThisOne={() => void performSave("this")}
        onAllFuture={() => void performSave("all")}
        onCancel={() => setRecurrencePromptOpen(false)}
      />
    </div>,
    document.body,
  );
}
