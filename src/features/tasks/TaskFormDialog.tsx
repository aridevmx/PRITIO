import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn, todayStr, localDateStr } from "@/lib/utils";
import { Field } from "@/components/Field";
import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";
import { QUADRANTS, QUADRANT_ORDER, type QuadrantIconKey } from "@/features/tasks/quadrants";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { createTask as apiCreateTask, updateTask as apiUpdateTask, listTaskReminders, saveTaskReminders } from "@/features/tasks/api";
import { useBilling } from "@/features/billing/BillingProvider";
import { parsePlanLimitError } from "@/features/billing/guarded";
import { openUpgrade } from "@/features/billing/upgrade";
import { notifyTaskChange } from "@/features/tasks/notifications";
import { RecurrenceEditDialog } from "@/features/tasks/RecurrenceEditDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type {
  Task,
  Quadrant,
  TaskKind,
  TaskVisibility,
  RecurrenceFreq,
  CreateTaskPayload,
} from "@/types";

const MEETING_FALLBACK_MINUTES = 30 as const;

const KIND_LABELS: Record<TaskKind, string> = {
  task: "Tarea",
  meeting: "Junta",
  event: "Evento",
};

const KIND_ACCENT: Record<TaskKind, { activeClassName: string; icon: ReactNode }> = {
  task: {
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
  meeting: {
    activeClassName: "text-pritio-purple",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  event: {
    activeClassName: "text-pritio-coral",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="2" width="11" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2.5 5.5h11M5.5 0.5V3.5M10.5 0.5V3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M5.5 8.5h5M8 6.5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
};

const QUADRANT_ICONS: Record<QuadrantIconKey, ReactNode> = {
  zap: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M9 1.5L3.5 9H8L7 14.5L12.5 7H8L9 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  users: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 13c.5-2.2 2-3.2 3.5-3.2s3 1 3.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11.2" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 13c.4-1.7 1.4-2.5 2.5-2.5 1 0 1.8.6 2.2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  archive: (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 8h3L7 10h2l1.5-2h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 4.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

function allowedKindsFor(type: string | undefined, isEdit: boolean, currentKind: TaskKind): TaskKind[] {
  const base: TaskKind[] =
    type === "personal"
      ? ["task", "meeting", "event"]
      : type === "team"
        ? ["task", "meeting"]
        : type === "family"
          ? ["task", "event"]
          : ["task", "meeting", "event"];
  if (isEdit && currentKind && !base.includes(currentKind)) return [...base, currentKind];
  return base;
}

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

function reminderWithOffset(anchor: string, minutes: number): string {
  const d = new Date(anchor);
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - minutes);
  const t = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${localDateStr(d)}T${t}`;
}

function timeISO(day: string, time: string): string | null {
  if (!day || !time) return null;
  const d = new Date(`${day}T${time}`);
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
  const { currentWorkspace, currentMember, profile, members } = useWorkspace();
  const { canCreate, hasFeature, usage, currentLimits } = useBilling();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [quadrant, setQuadrant] = useState<Quadrant>(defaultQuadrant);
  const [kind, setKind] = useState<TaskKind>("task");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [visibility, setVisibility] = useState<TaskVisibility>("all");
  const [showMore, setShowMore] = useState(false);
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq | "">("");
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<"none" | "date" | "count">("none");
  const [recurrenceCount, setRecurrenceCount] = useState(1);
  const [recurrenceChoice, setRecurrenceChoice] = useState<"this" | "all" | null>(null);
  const [recurrencePromptOpen, setRecurrencePromptOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<TaskKind | null>(null);
  const [reminders, setReminders] = useState<string[]>([]);
  const [newReminder, setNewReminder] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);

  const [assignees, setAssignees] = useState<{ id: string; name: string; linkedUserId: string | null }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    supabase
      .from("assignees")
      .select("id, name, linked_user_id")
      .eq("workspace_id", currentWorkspace.id)
      .then(({ data }) =>
        setAssignees(
          (data ?? []).map((a: { id: string; name: string; linked_user_id: string | null }) => ({
            id: a.id,
            name: a.name,
            linkedUserId: a.linked_user_id,
          })),
        ),
      );
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

  const applyKind = (k: TaskKind) => {
    setKind(k);
    if (!startDate && dueDate) setStartDate(dueDate);
  };

  const workspaceType = currentWorkspace?.type;
  const kinds = allowedKindsFor(workspaceType, isEdit, task?.kind ?? "task");
  const currentRole = currentMember?.role ?? "owner";
  const isRestrictedMember =
    (workspaceType === "family" || workspaceType === "team") && currentRole === "member";

  const memberRoleByUserId = useMemo(
    () => new Map(members.map((m) => [m.userId, m.role])),
    [members],
  );

  const selfAssignee = useMemo(
    () => assignees.find((a) => a.linkedUserId === profile?.id) ?? null,
    [assignees, profile?.id],
  );

  const allowedAssigneeIds = useMemo<Set<string> | null>(() => {
    if (currentRole === "owner" || currentRole === "admin") return null;
    if (currentRole === "leader") {
      return new Set(
        assignees
          .filter((a) => {
            if (!a.linkedUserId) return true;
            const r = memberRoleByUserId.get(a.linkedUserId);
            return !r || r === "member";
          })
          .map((a) => a.id),
      );
    }
    if (currentRole === "member") {
      return selfAssignee ? new Set([selfAssignee.id]) : new Set<string>();
    }
    return null;
  }, [currentRole, assignees, memberRoleByUserId, selfAssignee]);

  const defaultVisibility: TaskVisibility = workspaceType === "family" ? "assigned" : "all";
  const showDueDate = hasFeature("due_date") || (isEdit && !!task?.dueDate);
  const kindOptions = kinds.map(
    (k): SegmentedOption<TaskKind> => ({
      value: k,
      label: KIND_LABELS[k],
      activeClassName: KIND_ACCENT[k].activeClassName,
      icon: KIND_ACCENT[k].icon,
    }),
  );

  const reminderAnchor = startTime && startDate ? `${startDate}T${startTime}` : dueDate ? `${dueDate}T09:00` : "";

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description ?? "");
        setShowDescription(!!task.description);
        setQuadrant(task.quadrant);
        setKind(task.kind);
        setDueDate(task.dueDate ?? "");
        setVisibility(task.visibility ?? defaultVisibility);
        if (task.startAt) {
          const start = new Date(task.startAt);
          const sTime = snapTo5(
            start.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }),
          );
          setStartDate(localDateStr(start));
          setStartTime(sTime);
          setAllDay(false);
          if (task.endAt) {
            const end = new Date(task.endAt);
            setEndDate(localDateStr(end));
            setEndTime(
              snapTo5(
                end.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }),
              ),
            );
          } else {
            setEndDate("");
            setEndTime("");
          }
        } else if (task.startDate) {
          setStartDate(task.startDate);
          setEndDate(task.endDate ?? task.startDate);
          setStartTime("");
          setEndTime("");
          setAllDay(true);
        } else {
          setStartDate(task.dueDate ?? "");
          setEndDate("");
          setStartTime("");
          setEndTime("");
          setAllDay(task.kind !== "meeting");
        }
        setMeetingLink(task.meetingLink ?? "");
        setLocation(task.location ?? "");
        setRequiresApproval(task.requiresApproval);
        setIsCompleted(task.completed);
        setProjectId(task.projectId ?? "");
        setSelectedAssigneeIds(task.assigneeIds);
        setRecurrenceFreq(task.recurrenceFreq ?? "");
        setRecurrenceInterval(task.recurrenceInterval || 1);
        setRecurrenceEndDate(task.recurrenceEndDate ?? "");
        setRecurrenceEndMode(
          task.recurrenceCount != null ? "count" : task.recurrenceEndDate ? "date" : "none",
        );
        setRecurrenceCount(task.recurrenceCount ?? 1);
        setRecurrenceChoice(null);
      } else {
        setTitle("");
        setDescription("");
        setShowDescription(false);
        setQuadrant(defaultQuadrant);
        setKind("task");
        setDueDate(defaultStartTime ? "" : (defaultDueDate ?? ""));
        setStartDate(defaultDueDate ?? "");
        setEndDate("");
        setStartTime(defaultStartTime ?? "");
        setEndTime("");
        setAllDay(!defaultStartTime);
        setVisibility(defaultVisibility);
        setLocation("");
        setMeetingLink("");
        setRequiresApproval(false);
        setIsCompleted(false);
        setProjectId("");
        setSelectedAssigneeIds([]);
        setRecurrenceFreq("");
        setRecurrenceInterval(1);
        setRecurrenceEndDate("");
        setRecurrenceEndMode("none");
        setRecurrenceCount(1);
        setRecurrenceChoice(null);
        setReminders([]);
        setNewReminder("");
      }
      setError("");
      setShowMore(false);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [open, task, defaultQuadrant, defaultDueDate, defaultStartTime, defaultVisibility]);

  useEffect(() => {
    if (!open) return;
    setNewReminder("");
    if (!task) {
      setReminders([]);
      return;
    }
    let cancelled = false;
    void listTaskReminders(task.id)
      .then((rs) => {
        if (cancelled) return;
        setReminders(
          rs
            .filter((r) => r.createdBy === profile?.id)
            .map((r) => {
              const d = new Date(r.remindAt);
              const t = snapTo5(
                d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }),
              );
              return `${localDateStr(d)}T${t}`;
            }),
        );
      })
      .catch(() => {
        if (!cancelled) setReminders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, task, profile?.id]);

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
    if (allowedAssigneeIds && !allowedAssigneeIds.has(id)) return;
    setSelectedAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  useEffect(() => {
    if (!open || !isEdit || !isRestrictedMember || !selfAssignee) return;
    setSelectedAssigneeIds((prev) =>
      prev.includes(selfAssignee.id) ? prev : [...prev, selfAssignee.id],
    );
  }, [open, isEdit, isRestrictedMember, selfAssignee]);

  const performSave = useCallback(async (choice: "this" | "all" | null) => {
    if (!title.trim()) {
      setError("El titulo es requerido");
      return;
    }
    if ((kind === "meeting" || kind === "event") && !startDate) {
      setError("Indica el día de inicio");
      return;
    }
    if (endDate && startDate && endDate < startDate) {
      setError("La fecha de fin no puede ser anterior a la de inicio");
      return;
    }
    if (
      !allDay &&
      startDate &&
      startTime &&
      endDate === startDate &&
      endTime &&
      timeToMinutes(endTime) <= timeToMinutes(startTime)
    ) {
      setError("La hora de fin debe ser posterior a la de inicio");
      return;
    }
    if (!currentWorkspace || !profile) {
      setError("No hay workspace o perfil disponible. Cierra sesion y vuelve a entrar.");
      return;
    }

    if (!isEdit) {
      if (kind === "meeting" && !canCreate("meetings")) return;
      if (kind === "event" && !canCreate("events")) return;
    }

    setSaving(true);
    setError("");
    setRecurrencePromptOpen(false);

    const startISO = allDay ? null : timeISO(startDate, startTime);
    let endISO = allDay ? null : timeISO(endDate, endTime);
    if (!endISO && startISO && kind === "meeting") {
      const fallback = new Date(startISO);
      fallback.setMinutes(fallback.getMinutes() + MEETING_FALLBACK_MINUTES);
      endISO = fallback.toISOString();
    }

    const effectiveDueDate =
      kind === "meeting"
        ? (startDate || null)
        : kind === "event"
          ? (startDate || null)
          : (dueDate || null);
    const effectiveStartDate =
      kind === "event"
        ? (startDate || null)
        : kind === "task" && allDay
          ? (startDate || null)
          : null;
    const effectiveEndDate =
      kind === "event"
        ? (endDate || startDate || null)
        : kind === "task" && allDay
          ? (endDate || startDate || null)
          : null;
    const effectiveStartAt = startISO;
    const effectiveEndAt = endISO;
    const effectiveVisibility: TaskVisibility =
      workspaceType === "family"
        ? isRestrictedMember ? "assigned" : visibility
        : "all";

    let assigneeIds = selectedAssigneeIds;
    if (allowedAssigneeIds) {
      assigneeIds = selectedAssigneeIds.filter((id) => allowedAssigneeIds.has(id));
      if (isRestrictedMember && selfAssignee && !assigneeIds.includes(selfAssignee.id)) {
        assigneeIds = [...assigneeIds, selfAssignee.id];
      }
    }

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
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
          visibility: effectiveVisibility,
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
          assigneeIds,
          completed: isCompleted,
          completedAt: isCompleted
            ? (task?.completedAt ?? new Date().toISOString())
            : null,
          recurrenceFreq: effectiveFreq,
          recurrenceInterval: recurrenceFreq === "" ? 1 : recurrenceInterval,
          recurrenceEndDate:
            recurrenceFreq === "" || recurrenceEndMode !== "date" ? null : recurrenceEndDate || null,
          recurrenceCount:
            recurrenceFreq === "" || recurrenceEndMode !== "count" ? null : recurrenceCount,
        });
      } else {
        const payload: CreateTaskPayload = {
          workspaceId: currentWorkspace.id,
          title: title.trim(),
          description: description.trim() || null,
          quadrant,
          kind,
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
          visibility: effectiveVisibility,
          dueDate: effectiveDueDate,
          startAt: effectiveStartAt,
          endAt: effectiveEndAt,
          location: location.trim() || null,
          meetingLink: meetingLink.trim() || null,
          requiresApproval,
          approvalRequestedAt,
          projectId: projectId || null,
          assigneeIds,
          recurrenceFreq: effectiveFreq,
          recurrenceInterval: recurrenceFreq === "" ? 1 : recurrenceInterval,
          recurrenceEndDate:
            recurrenceFreq === "" || recurrenceEndMode !== "date" ? null : recurrenceEndDate || null,
          recurrenceCount:
            recurrenceFreq === "" || recurrenceEndMode !== "count" ? null : recurrenceCount,
          createdBy: profile.id,
        };
        if (!canCreate("active_tasks")) return;
        saved = await apiCreateTask(payload);
      }

      if (isEdit || reminders.length > 0) {
        await saveTaskReminders(saved.id, reminders);
      }

      if (isEdit) {
        const assigneesChanged =
          assigneeIds.length !== (task?.assigneeIds.length ?? 0) ||
          assigneeIds.some((id) => !task?.assigneeIds.includes(id));
        if (assigneesChanged) {
          void notifyTaskChange("assigned", saved.id, currentWorkspace.id, assigneeIds);
        } else {
          void notifyTaskChange("updated", saved.id, currentWorkspace.id, assigneeIds);
        }
      } else if (kind === "meeting") {
        void notifyTaskChange("meeting_created", saved.id, currentWorkspace.id, assigneeIds);
      } else if (assigneeIds.length > 0) {
        void notifyTaskChange("assigned", saved.id, currentWorkspace.id, assigneeIds);
      }

      if (isEdit && isCompleted && !task?.completed) {
        void notifyTaskChange("completed", saved.id, currentWorkspace.id, assigneeIds);
      }

      if (shouldNotifyApproval && managerUserIds.length > 0) {
        void notifyTaskChange("approval_requested", saved.id, currentWorkspace.id, [], undefined, managerUserIds);
      }

      onSaved(saved);
      toast.success(
        isEdit
          ? kind === "meeting" ? "Junta actualizada" : kind === "event" ? "Evento actualizado" : "Tarea actualizada"
          : kind === "meeting" ? "Junta creada" : kind === "event" ? "Evento creado" : "Tarea creada",
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
    title, description, quadrant, kind, dueDate, startDate, startTime, endDate, endTime, allDay,
    visibility, location, meetingLink, requiresApproval, projectId,
    selfAssignee, isRestrictedMember, workspaceType, allowedAssigneeIds,
    recurrenceFreq, recurrenceInterval, recurrenceEndDate, recurrenceEndMode, recurrenceCount,
    currentWorkspace, profile, members, isEdit, task,
    canCreate, onSaved, onClose, toast, isCompleted, reminders,
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
        <div className="flex items-center gap-3">
          {isEdit && (
            <button
              type="button"
              onClick={() => setIsCompleted((v) => !v)}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-green/30",
                isCompleted
                  ? "border-pritio-green bg-pritio-green text-white"
                  : "border-line-strong hover:border-pritio-green hover:ring-2 hover:ring-pritio-green/20",
              )}
            >
              {isCompleted && (
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6L5 8.5L9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          )}
          <h3
            className={cn(
              "text-lg font-bold text-ink",
              isCompleted && "line-through text-ink-muted",
            )}
          >
            {isEdit ? "Editar tarea" : "Nueva tarea"}
          </h3>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <SegmentedControl
              value={kind}
              pill
              onChange={(k) => {
                if (isEdit && k !== task?.kind) {
                  setPendingKind(k);
                  return;
                }
                applyKind(k);
              }}
              options={kindOptions as [SegmentedOption<TaskKind>, SegmentedOption<TaskKind>, ...SegmentedOption<TaskKind>[]]}
            />
            {kind === "meeting" && currentLimits.meetingsPerMonth !== null && (
              <p className="mt-2 text-xs text-ink-soft">
                Juntas este mes:{" "}
                <span className="font-semibold tabular-nums text-pritio-purple">
                  {usage.meetingsThisMonth}/{currentLimits.meetingsPerMonth}
                </span>
                {!isEdit && usage.meetingsThisMonth >= currentLimits.meetingsPerMonth && " · Plan alcanzado"}
              </p>
            )}
            {kind === "event" && currentLimits.eventsPerMonth !== null && (
              <p className="mt-2 text-xs text-ink-soft">
                Eventos este mes:{" "}
                <span className="font-semibold tabular-nums text-pritio-coral">
                  {usage.eventsThisMonth}/{currentLimits.eventsPerMonth}
                </span>
                {!isEdit && usage.eventsThisMonth >= currentLimits.eventsPerMonth && " · Plan alcanzado"}
              </p>
            )}
          </div>

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
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-ink">Descripcion</label>
                <button
                  type="button"
                  onClick={() => {
                    setDescription("");
                    setShowDescription(false);
                  }}
                  className="text-xs font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  Quitar
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles adicionales..."
                rows={3}
                className="w-full resize-none rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
              />
            </div>
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
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg",
                        isActive ? meta.classes.badge : cn(meta.classes.softBg, meta.classes.accentText),
                      )}
                    >
                      {QUADRANT_ICONS[meta.iconKey]}
                    </span>
                    <span className="text-xs font-semibold leading-tight">{meta.title}</span>
                    <span className={cn("text-[10px] leading-tight", isActive ? "opacity-90" : "text-ink-muted")}>
                      {meta.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Fecha y hora */}
          <div className="rounded-xl border border-line bg-surface-subtle/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted">Fecha y hora</p>
              {kind !== "meeting" && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    checked={allDay}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setAllDay(next);
                      if (next) {
                        setStartTime("");
                        setEndTime("");
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-line text-pritio-blue focus:ring-pritio-blue/20"
                  />
                  Todo el día
                </label>
              )}
            </div>

            {allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={
                    kind === "meeting" ? "Día de la junta" : kind === "event" ? "Día de inicio" : "Fecha"
                  }
                >
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                  />
                </Field>
                <Field label="Día de fin" badge="Opcional">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                  />
                </Field>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label={kind === "meeting" ? "Inicio de la junta" : "Inicio"}>
                  <input
                    type="datetime-local"
                    value={startDate ? `${startDate}T${startTime || "00:00"}` : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        setStartDate("");
                        setStartTime("");
                        return;
                      }
                      const [d, t] = v.split("T");
                      setStartDate(d);
                      setStartTime(t || "");
                    }}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                  />
                </Field>
                <Field label="Fin" badge="Opcional">
                  <input
                    type="datetime-local"
                    value={endDate ? `${endDate}T${endTime || "00:00"}` : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) {
                        setEndDate("");
                        setEndTime("");
                        return;
                      }
                      const [d, t] = v.split("T");
                      setEndDate(d);
                      setEndTime(t || "");
                    }}
                    className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                  />
                </Field>
              </div>
            )}

            {kind === "task" && showDueDate && (
              <div className="mt-3 border-t border-line pt-3">
                <Field label="Fecha limite" badge="Opcional">
                  <div className="flex flex-col gap-1.5">
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
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
              </div>
            )}
          </div>

          {/* Meeting extras */}
          {kind === "meeting" && (
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
          )}

          {/* Event extras */}
          {kind === "event" && (
            <Field label="Dirección / Lugar" badge="Opcional">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Casa de la abuela, Parque..."
                className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-coral focus:outline-none focus:ring-2 focus:ring-pritio-coral/20"
              />
            </Field>
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
                          {!(isRestrictedMember && selfAssignee?.id === id) && (
                            <button
                              type="button"
                              onClick={() => toggleAssignee(id)}
                              className="ml-0.5 text-pritio-blue/60 hover:text-pritio-blue"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                            </button>
                          )}
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
                      .filter((a) => !allowedAssigneeIds || allowedAssigneeIds.has(a.id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                  </select>
                  {isRestrictedMember && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
                      Los miembros solo pueden asignarse tareas a sí mismos.
                    </p>
                  )}
                </Field>
              )}
            </div>
          )}

          {/* Visibility toggle (family workspaces) */}
          {workspaceType === "family" && !isRestrictedMember && (
            <div className="rounded-xl border border-line bg-surface-subtle/60 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Visibilidad</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setVisibility("assigned")}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                    visibility === "assigned"
                      ? "border-pritio-blue bg-pritio-blue/5 text-pritio-blue"
                      : "border-line bg-surface text-ink-soft hover:bg-surface-muted",
                  )}
                >
                  Solo asignados
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("all")}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                    visibility === "all"
                      ? "border-pritio-blue bg-pritio-blue/5 text-pritio-blue"
                      : "border-line bg-surface text-ink-soft hover:bg-surface-muted",
                  )}
                >
                  Visible para todos
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                {visibility === "all"
                  ? "Todos los miembros de la familia pueden ver este elemento."
                  : "Solo los miembros asignados podrán ver este elemento."}
              </p>
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
              {/* Reminders */}
              <div className="rounded-xl border border-line bg-surface-subtle/60 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Recordatorios</p>
                {reminders.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {reminders.map((r, i) => (
                      <span
                        key={`${r}-${i}`}
                        className="inline-flex items-center gap-1 rounded-full bg-pritio-purple/10 px-2.5 py-1 text-xs font-medium text-pritio-purple"
                      >
                        {new Date(r).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        <button
                          type="button"
                          onClick={() => setReminders((prev) => prev.filter((_, j) => j !== i))}
                          className="text-pritio-purple/60 hover:text-pritio-purple"
                          aria-label="Quitar recordatorio"
                        >
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={newReminder}
                    onChange={(e) => setNewReminder(e.target.value)}
                    className="min-w-0 flex-1 rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-purple focus:outline-none focus:ring-2 focus:ring-pritio-purple/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newReminder && !reminders.includes(newReminder)) {
                        setReminders((prev) => [...prev, newReminder]);
                      }
                      setNewReminder("");
                    }}
                    className="rounded-xl bg-pritio-purple px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-pritio-purple/90"
                  >
                    Agregar
                  </button>
                </div>
                {reminderAnchor && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[
                      { label: "En el momento", minutes: 0 },
                      { label: "15 min antes", minutes: 15 },
                      { label: "1 h antes", minutes: 60 },
                      { label: "1 día antes", minutes: 1440 },
                    ].map((p) => {
                      const v = reminderWithOffset(reminderAnchor, p.minutes);
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => {
                            if (v && !reminders.includes(v)) setReminders((prev) => [...prev, v]);
                          }}
                          className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-soft transition-all hover:bg-surface-muted"
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                  Recibirás una notificación in-app, por correo y push en la fecha elegida.
                </p>
              </div>

              {/* Recurrence */}
              <div className="rounded-xl border border-line bg-surface-subtle/60 p-3">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Repetir</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "", label: "No" },
                    { value: "daily", label: "Diario" },
                    { value: "weekly", label: "Semanal" },
                    { value: "monthly", label: "Mensual" },
                    { value: "yearly", label: "Anual" },
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
                  <>
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
                      <Field label="Finaliza">
                        <select
                          value={recurrenceEndMode}
                          onChange={(e) => setRecurrenceEndMode(e.target.value as "none" | "date" | "count")}
                          className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                        >
                          <option value="none">Nunca</option>
                          <option value="date">En fecha</option>
                          <option value="count">Tras N veces</option>
                        </select>
                      </Field>
                    </div>
                    {recurrenceEndMode === "date" && (
                      <Field label="Fecha final">
                        <input
                          type="date"
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                        />
                      </Field>
                    )}
                    {recurrenceEndMode === "count" && (
                      <Field label="Numero de repeticiones" badge="Opcional">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={recurrenceCount}
                          onChange={(e) => setRecurrenceCount(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                        />
                      </Field>
                    )}
                  </>
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
      <ConfirmDialog
        open={pendingKind !== null}
        onClose={() => setPendingKind(null)}
        onConfirm={() => {
          if (pendingKind) applyKind(pendingKind);
          setPendingKind(null);
        }}
        title="Cambiar tipo"
        description={`Al cambiar de ${KIND_LABELS[task?.kind ?? "task"]} a ${KIND_LABELS[pendingKind ?? "task"]} se reorganizaran las fechas. Estas seguro?`}
        confirmLabel="Cambiar"
      />
    </div>,
    document.body,
  );
}
