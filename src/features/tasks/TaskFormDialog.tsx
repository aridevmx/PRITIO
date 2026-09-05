import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn, todayStr, localDateStr, isNotesEmpty, formatDayLabel, stripHtml } from "@/lib/utils";
import { Field } from "@/components/Field";
import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";
import { PropertyRow } from "@/components/PropertyRow";
import { DatePickerPopover } from "@/components/DatePickerPopover";
import { TimePicker } from "@/components/TimePicker";
import { useTimeFormat } from "@/lib/timeFormat";
import { QUADRANTS, QUADRANT_ORDER, type QuadrantIconKey } from "@/features/tasks/quadrants";
import { allowedKindsForWorkspace } from "@/features/tasks/kinds";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { createTask as apiCreateTask, updateTask as apiUpdateTask, listSubtasks, createSubtasks, updateSubtask, deleteSubtasks, listComments, createComment, deleteComment, listTaskReminders, saveTaskReminders, type TaskComment } from "@/features/tasks/api";
import { listDocsForTask, listDocs, linkDocToTask, unlinkDocFromTask, createDoc } from "@/features/docs/api";
import { TemplatePicker } from "@/features/docs/TemplatePicker";
import type { DocTemplate } from "@/features/docs/api";
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
const MAX_TASK_TITLE_LENGTH = 120;
const MAX_NOTES_VISIBLE_CHARS = 4000;
const MAX_SUBTASKS_PER_TASK = 20;

/* El editor rico (Tiptap) pesa ~120KB gz; se carga solo cuando el
   diálogo lo necesita, para no penalizar el bundle inicial. */
const RichTextEditor = lazy(() =>
  import("@/components/RichTextEditor").then((m) => ({ default: m.RichTextEditor })),
);

interface SubtaskDraft {
  key: string;
  id: string | null; // null = aún no existe en DB
  title: string;
  completed: boolean;
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
    >
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
        <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {label}
    </button>
  );
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

async function persistSubtasks(
  taskId: string,
  workspaceId: string,
  createdBy: string,
  drafts: SubtaskDraft[],
  originals: Map<string, { title: string; completed: boolean }>,
): Promise<void> {
  const currentIds = new Set(drafts.filter((d) => d.id).map((d) => d.id as string));
  const toDelete = [
    ...[...originals.keys()].filter((id) => !currentIds.has(id)),
    ...drafts.filter((d) => d.id && !d.title.trim()).map((d) => d.id as string),
  ];
  await deleteSubtasks(toDelete);

  const toCreate: { title: string; completed: boolean; position: number }[] = [];
  const updates: Promise<void>[] = [];
  drafts.forEach((draft, index) => {
    const cleanTitle = draft.title.trim();
    if (!draft.id) {
      if (cleanTitle) toCreate.push({ title: cleanTitle, completed: draft.completed, position: index });
      return;
    }
    if (!cleanTitle) return; // ya va en toDelete
    const original = originals.get(draft.id);
    if (original && original.title === cleanTitle && original.completed === draft.completed) return;
    updates.push(updateSubtask(draft.id, { title: cleanTitle, completed: draft.completed, position: index }));
  });

  await Promise.all(updates);
  await createSubtasks(taskId, workspaceId, createdBy, toCreate);
}

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
  const base = allowedKindsForWorkspace(type);
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
  defaultKind?: TaskKind;
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

function formatTimeLabel(t: string, is12: boolean): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (!is12) return `${h}:${m}`;
  const hh = Number(h) % 12 || 12;
  return `${hh}:${m} ${Number(h) < 12 ? "AM" : "PM"}`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  yearly: "Anual",
};

const ROW_ICONS = {
  fechas: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="3" width="11" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 1.5V4.5M10.5 1.5V4.5M2.5 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  repetir: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M13 6.3A5.5 5.5 0 003.4 4.6L2.7 5.4M3 9.7a5.5 5.5 0 009.6 1.7l.7-.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.5 2.5v3h3M13.5 13.5v-3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  recordatorios: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M8 2a4 4 0 014 4c0 2.6.7 3.7 1.3 4.3H2.7C3.3 9.7 4 8.6 4 6a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 12.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  proyecto: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M2 4.5A1.5 1.5 0 013.5 3H6l1.5 1.5h5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  asignados: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <circle cx="6" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 13c.5-2.2 2-3.2 3.5-3.2s3 1 3.5 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="11.2" cy="6" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 13c.4-1.7 1.4-2.5 2.5-2.5 1 0 1.8.6 2.2 1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  visibilidad: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  comentarios: (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 9.5c0 .8-.7 1.5-1.5 1.5H4l-2.5 2V3c0-.8.7-1.5 1.5-1.5h9c.8 0 1.5.7 1.5 1.5v6.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} as const;

export function TaskFormDialog({
  open,
  onClose,
  onSaved,
  task,
  defaultQuadrant = "do",
  defaultDueDate,
  defaultStartTime,
  defaultKind = "task",
}: TaskFormDialogProps) {
  const { currentWorkspace, currentMember, profile, members } = useWorkspace();
  const { canCreate, hasFeature, usage, currentLimits } = useBilling();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [quadrant, setQuadrant] = useState<Quadrant>(defaultQuadrant);
  const [kind, setKind] = useState<TaskKind>(defaultKind);
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [visibility, setVisibility] = useState<TaskVisibility>("all");
  const [openProperty, setOpenProperty] = useState<string | null>(null);
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
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [subtasksExpanded, setSubtasksExpanded] = useState(true);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [linkedDocs, setLinkedDocs] = useState<{ id: string; title: string }[]>([]);
  const [workspaceDocs, setWorkspaceDocs] = useState<{ id: string; title: string }[]>([]);
  const [pendingDocIds, setPendingDocIds] = useState<string[]>([]);
  const [docsPickerOpen, setDocsPickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const docsPickerRef = useRef<HTMLDivElement>(null);
  const subtaskKeyCounter = useRef(0);
  const originalSubtasksRef = useRef<Map<string, { title: string; completed: boolean }>>(new Map());

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

  const timeIs12 = useTimeFormat() === "12h";
  const timeAccent: "blue" | "purple" | "coral" =
    kind === "meeting" ? "purple" : kind === "event" ? "coral" : "blue";
  const toggleProperty = useCallback((key: string) => {
    setOpenProperty((cur) => (cur === key ? null : key));
  }, []);

  const fechasSummary = (() => {
    let base = "";
    if (startDate) base = formatDayLabel(startDate);
    else if (endDate) base = formatDayLabel(endDate);
    if (base && !allDay && startTime) {
      const endLabel = endTime ? `–${formatTimeLabel(endTime, timeIs12)}` : "";
      base += `, ${formatTimeLabel(startTime, timeIs12)}${endLabel}`;
    }
    if (base && allDay && endDate && endDate !== startDate) base += ` – ${formatDayLabel(endDate)}`;
    if (!base) return "";
    if (kind === "task" && showDueDate && dueDate) base += ` · vence ${formatDayLabel(dueDate)}`;
    return base;
  })();

  const repetirSummary = recurrenceFreq ? (RECURRENCE_LABELS[recurrenceFreq] ?? "") : "";

  const recordatoriosSummary =
    reminders.length > 0
      ? reminders.length === 1
        ? "1 recordatorio"
        : `${reminders.length} recordatorios`
      : "";

  const asignadosSummary = selectedAssigneeIds
    .map((id) => assignees.find((a) => a.id === id)?.name ?? "")
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    if (open) {
      if (task) {
        setTitle(task.title);
        setDescription(task.description ?? "");
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
        setQuadrant(defaultQuadrant);
        setKind(defaultKind);
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
      setOpenProperty(null);
      setShowNotes(false);
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

  useEffect(() => {
    if (!open) {
      setSubtasks([]);
      setShowSubtasks(false);
      setNewSubtaskTitle("");
      setSubtasksExpanded(true);
      setComments([]);
      setNewComment("");
      setLinkedDocs([]);
      setPendingDocIds([]);
      setWorkspaceDocs([]);
      setDocsPickerOpen(false);
      originalSubtasksRef.current = new Map();
      return;
    }
    let cancelled = false;
    if (currentWorkspace?.id) {
      void listDocs(currentWorkspace.id)
        .then((rows) => {
          if (!cancelled) setWorkspaceDocs(rows.map((d) => ({ id: d.id, title: d.title })));
        })
        .catch(() => {
          if (!cancelled) setWorkspaceDocs([]);
        });
    } else {
      setWorkspaceDocs([]);
    }
    if (task) {
      void listComments(task.id)
        .then((rows) => {
          if (!cancelled) setComments(rows);
        })
        .catch(() => {
          if (!cancelled) setComments([]);
        });
      void listDocsForTask(task.id)
        .then((rows) => {
          if (!cancelled) setLinkedDocs(rows);
        })
        .catch(() => {
          if (!cancelled) setLinkedDocs([]);
        });
      void listSubtasks(task.id)
        .then((rows) => {
          if (cancelled) return;
          const originals = new Map<string, { title: string; completed: boolean }>();
          rows.forEach((r) => originals.set(r.id, { title: r.title, completed: r.completed }));
          originalSubtasksRef.current = originals;
          setSubtasks(
            rows.map((r) => ({ key: r.id, id: r.id, title: r.title, completed: r.completed })),
          );
        })
        .catch(() => {});
    } else {
      setComments([]);
      setLinkedDocs([]);
      setPendingDocIds([]);
      setSubtasks([]);
      setShowSubtasks(false);
      setNewSubtaskTitle("");
      setSubtasksExpanded(true);
      setComments([]);
      setNewComment("");
      originalSubtasksRef.current = new Map();
    }
    return () => {
      cancelled = true;
    };
  }, [open, task, currentWorkspace?.id]);

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

  const addSubtask = () => {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    if (subtasks.length >= MAX_SUBTASKS_PER_TASK) {
      toast.error(`Una tarea puede tener máximo ${MAX_SUBTASKS_PER_TASK} subtareas`);
      return;
    }
    subtaskKeyCounter.current += 1;
    setSubtasks((prev) => [
      ...prev,
      { key: `tmp-${subtaskKeyCounter.current}-${Date.now()}`, id: null, title: t, completed: false },
    ]);
    setNewSubtaskTitle("");
  };

  const removeSubtask = (key: string) =>
    setSubtasks((prev) => prev.filter((s) => s.key !== key));

  const toggleSubtask = (key: string) =>
    setSubtasks((prev) =>
      prev.map((s) => (s.key === key ? { ...s, completed: !s.completed } : s)),
    );

  const renameSubtask = (key: string, title: string) =>
    setSubtasks((prev) => prev.map((s) => (s.key === key ? { ...s, title } : s)));

  const submitComment = useCallback(async () => {
    const body = newComment.trim();
    if (!body || !task || commentSaving) return;
    setCommentSaving(true);
    try {
      const created = await createComment(
        task.id,
        task.workspaceId,
        profile?.id ?? "",
        profile?.fullName ?? "Miembro",
        body,
      );
      setComments((prev) => [...prev, created]);
      setNewComment("");
    } catch {
      toast.error("No se pudo enviar el comentario");
    } finally {
      setCommentSaving(false);
    }
  }, [newComment, task, commentSaving, profile?.id, profile?.fullName, toast]);

  const removeComment = useCallback(async (id: string) => {
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      /* silencioso: la lista queda como está */
    }
  }, []);

  // Cerrar picker de documentos con clic afuera
  useEffect(() => {
    if (!docsPickerOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (docsPickerRef.current && !docsPickerRef.current.contains(e.target as Node)) {
        setDocsPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [docsPickerOpen]);

  const toggleDocLink = useCallback(
    async (docId: string) => {
      const linked = linkedDocs.some((d) => d.id === docId);
      const docTitle =
        workspaceDocs.find((d) => d.id === docId)?.title ??
        linkedDocs.find((d) => d.id === docId)?.title ??
        "";
      setLinkedDocs((prev) =>
        linked ? prev.filter((d) => d.id !== docId) : [...prev, { id: docId, title: docTitle }],
      );
      if (!task) {
        setPendingDocIds((prev) =>
          linked ? prev.filter((id) => id !== docId) : [...prev, docId],
        );
        return;
      }
      try {
        if (linked) await unlinkDocFromTask(docId, task.id);
        else await linkDocToTask(docId, task.id, task.workspaceId);
      } catch {
        setLinkedDocs((prev) =>
          linked ? [...prev, { id: docId, title: docTitle }] : prev.filter((d) => d.id !== docId),
        );
        toast.error("No se pudo actualizar el vínculo");
      }
    },
    [task, linkedDocs, workspaceDocs, toast],
  );

  const createLinkedDoc = useCallback(async (template?: DocTemplate | null) => {
    if (!profile || !currentWorkspace) return;
    try {
      const doc = await createDoc(
        currentWorkspace.id,
        profile.id,
        template?.name || title.trim() || "Sin título",
        null,
        template?.content ?? null,
      );
      setLinkedDocs((prev) => [...prev, { id: doc.id, title: doc.title }]);
      setWorkspaceDocs((prev) => [{ id: doc.id, title: doc.title }, ...prev]);
      if (task) {
        await linkDocToTask(doc.id, task.id, task.workspaceId);
      } else {
        setPendingDocIds((prev) => [...prev, doc.id]);
      }
      toast.success("Nota creada y vinculada");
    } catch {
      toast.error("No se pudo crear la nota");
    }
  }, [task, profile, currentWorkspace, title, toast]);

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
    if (title.trim().length > MAX_TASK_TITLE_LENGTH) {
      setError(`El título no puede exceder ${MAX_TASK_TITLE_LENGTH} caracteres`);
      return;
    }
    if (stripHtml(description).length > MAX_NOTES_VISIBLE_CHARS) {
      setError(`Las notas no pueden exceder ${MAX_NOTES_VISIBLE_CHARS.toLocaleString("es-MX")} caracteres`);
      toast.error("Las notas son demasiado largas");
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
          description: isNotesEmpty(description) ? null : description.trim(),
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
          description: isNotesEmpty(description) ? null : description.trim(),
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

      if (subtasks.length > 0 || originalSubtasksRef.current.size > 0) {
        try {
          await persistSubtasks(
            saved.id,
            currentWorkspace.id,
            profile.id,
            subtasks,
            originalSubtasksRef.current,
          );
        } catch {
          // Las subtareas no deben bloquear el guardado de la tarea
        }
      }

      // Vínculos de documentos pendientes (tarea nueva)
      if (!isEdit && pendingDocIds.length > 0) {
        for (const docId of pendingDocIds) {
          try {
            await linkDocToTask(docId, saved.id, currentWorkspace.id);
          } catch {
            // No bloquear el guardado por un vínculo fallido
          }
        }
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
      // Avisa a cualquier vista con useTasks que hay datos nuevos para que
      // actualice al instante (sin esperar al Realtime, que puede fallar o
      // tardar en ciertos entornos) y luego sincroniza desde el servidor.
      window.dispatchEvent(
        new CustomEvent("pritio:tasks-changed", {
          detail: { task: saved, workspaceId: saved.workspaceId },
        }),
      );
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
    subtasks,
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
      <div className="pritio-modal-enter max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-b-0 border-line bg-surface p-5 shadow-elevated md:mx-4 md:max-h-[90vh] md:max-w-3xl md:rounded-b-2xl md:border-b md:p-6">
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
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
          {/* Columna principal: captura */}
          <div className="min-w-0 space-y-5">
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
            {kind === "meeting" && !isEdit && currentLimits.meetingsPerMonth !== null && usage.meetingsThisMonth >= currentLimits.meetingsPerMonth && (
              <p className="mt-2 text-xs font-medium text-pritio-purple">
                Plan alcanzado · {usage.meetingsThisMonth}/{currentLimits.meetingsPerMonth} juntas este mes
              </p>
            )}
            {kind === "event" && !isEdit && currentLimits.eventsPerMonth !== null && usage.eventsThisMonth >= currentLimits.eventsPerMonth && (
              <p className="mt-2 text-xs font-medium text-pritio-coral">
                Plan alcanzado · {usage.eventsThisMonth}/{currentLimits.eventsPerMonth} eventos este mes
              </p>
            )}
          </div>

          {/* El título es el acto principal: input grande, sin etiqueta */}
          <div className="relative">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value.slice(0, MAX_TASK_TITLE_LENGTH));
                if (error) setError("");
              }}
              maxLength={MAX_TASK_TITLE_LENGTH}
              placeholder="¿Qué hay que hacer?"
              aria-label="Título"
              className="w-full border-b border-line bg-transparent px-0 pb-2 pt-1 text-lg font-semibold text-ink transition-colors placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none"
            />
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute bottom-2 right-0 text-[11px] font-medium tabular-nums transition-colors",
                title.length >= MAX_TASK_TITLE_LENGTH
                  ? "text-red-500"
                  : title.length > MAX_TASK_TITLE_LENGTH - 15
                    ? "text-pritio-coral"
                    : "text-ink-muted/70",
              )}
            >
              {title.length}/{MAX_TASK_TITLE_LENGTH}
            </span>
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
          </div>

          <Field label="Cuadrante">
            <div className="grid grid-cols-4 gap-1.5">
              {QUADRANT_ORDER.map((qKey) => {
                const meta = QUADRANTS[qKey];
                const isActive = quadrant === qKey;
                return (
                  <button
                    key={qKey}
                    type="button"
                    onClick={() => setQuadrant(qKey)}
                    title={meta.subtitle}
                    aria-pressed={isActive}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 transition-all",
                      isActive
                        ? cn(meta.classes.borderStrong, meta.classes.softBg, meta.classes.accentText)
                        : "border-line bg-surface hover:bg-surface-muted",
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
                    <span className={cn("text-[11px] font-semibold leading-tight", !isActive && "text-ink-soft")}>
                      {meta.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Meeting extras */}
          {kind === "meeting" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Dirección / Lugar">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ej: Sala B, Edificio Principal"
                  className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-purple focus:outline-none focus:ring-2 focus:ring-pritio-purple/20"
                />
              </Field>
              <Field label="Enlace de la junta">
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
            <Field label="Dirección / Lugar">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Casa de la abuela, Parque..."
                className="w-full rounded-xl border border-line bg-surface-subtle px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-coral focus:outline-none focus:ring-2 focus:ring-pritio-coral/20"
              />
            </Field>
          )}

          {/* Notas: se revelan al pedirlas; las notas legacy editables aparecen solas */}
          {(showNotes || (isEdit && !!task?.description)) ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-ink">Notas</label>
                <button
                  type="button"
                  onClick={() => {
                    setDescription("");
                    setShowNotes(false);
                  }}
                  className="text-xs font-medium text-ink-muted transition-colors hover:text-ink"
                >
                  Quitar
                </button>
              </div>
              <Suspense
                fallback={
                  <div className="min-h-[7.25rem] animate-pulse rounded-xl border border-line bg-surface-subtle" />
                }
              >
                <RichTextEditor
                  content={description || null}
                  onChange={setDescription}
                  placeholder="Detalles adicionales..."
                  contentClassName="min-h-[4.75rem]"
                />
              </Suspense>
              {(() => {
                const visibleCount = stripHtml(description).length;
                return (
                  <p
                    className={cn(
                      "text-right text-[11px] font-medium tabular-nums",
                      visibleCount >= MAX_NOTES_VISIBLE_CHARS
                        ? "text-red-500"
                        : visibleCount > MAX_NOTES_VISIBLE_CHARS - 400
                          ? "text-pritio-coral"
                          : "text-ink-muted/70",
                    )}
                  >
                    {visibleCount.toLocaleString("es-MX")}/
                    {MAX_NOTES_VISIBLE_CHARS.toLocaleString("es-MX")}
                  </p>
                );
              })()}
            </div>
          ) : (
            <div>
              <AddRowButton label="Agregar notas" onClick={() => setShowNotes(true)} />
            </div>
          )}

          {/* Documentos vinculados */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink">Documentos</label>
            <div className="flex flex-wrap items-center gap-1.5" ref={docsPickerRef}>
              {linkedDocs.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-subtle py-1 pl-2 pr-1.5 text-xs font-medium text-ink"
                >
                  <svg className="h-3 w-3 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="none">
                    <path d="M4.5 2h4.75L12.5 5.25V13a1 1 0 01-1 1h-7a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <path d="M9 2v3.5h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  <span className="max-w-[10rem] truncate">{d.title || "Sin título"}</span>
                  <button
                    type="button"
                    onClick={() => void toggleDocLink(d.id)}
                    aria-label={`Desvincular documento: ${d.title || "Sin título"}`}
                    className="text-ink-muted transition-colors hover:text-pritio-coral"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                      <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setDocsPickerOpen((v) => !v)}
                aria-expanded={docsPickerOpen}
                className="rounded-full border border-dashed border-line-strong/70 px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-pritio-blue/50 hover:text-pritio-blue"
              >
                + Vincular documento
              </button>
            </div>

            {docsPickerOpen && (
              <div className="pritio-menu-enter ml-6 w-[19rem] rounded-xl border border-line bg-surface p-2 shadow-elevated">
                {workspaceDocs.length === 0 ? (
                  <p className="px-2 py-2 text-xs leading-relaxed text-ink-muted">
                    Todavía no hay documentos en este workspace.
                  </p>
                ) : (
                  <div className="max-h-[14rem] space-y-0.5 overflow-y-auto">
                    {workspaceDocs.map((d) => {
                      const linked = linkedDocs.some((x) => x.id === d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => void toggleDocLink(d.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
                            linked && "bg-pritio-blue/5",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">
                            {d.title || "Sin título"}
                          </span>
                          {linked && (
                            <svg className="h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                              <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setTemplatePickerOpen(true)}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-line px-2 pt-2 pb-1 text-left text-sm font-medium text-pritio-blue transition-colors hover:bg-pritio-blue/5"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  Crear nota y vincular
                </button>
              </div>
            )}
          </div>

          {/* Subtareas (contraíbles) */}
          {subtasks.length > 0 || showSubtasks ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSubtasksExpanded((v) => !v)}
                aria-expanded={subtasksExpanded}
                className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-muted"
              >
                <svg
                  className={cn(
                    "h-3 w-3 shrink-0 text-ink-muted transition-transform duration-200",
                    subtasksExpanded && "rotate-90",
                  )}
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm font-medium text-ink">Subtareas</span>
                {subtasks.length > 0 && (
                  <span
                    className={cn(
                      "ml-auto pr-1 text-xs font-semibold tabular-nums text-ink-muted",
                      subtasks.length >= MAX_SUBTASKS_PER_TASK && "text-pritio-coral",
                    )}
                  >
                    {subtasks.filter((s) => s.completed).length}/{subtasks.length}
                  </span>
                )}
              </button>
              {subtasksExpanded && (
                <>
                  {subtasks.map((st) => (
                    <div key={st.key} className="group/sub flex items-center gap-2 px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => toggleSubtask(st.key)}
                        aria-label={st.completed ? "Marcar subtarea como pendiente" : "Marcar subtarea como completada"}
                        className={cn(
                          "flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-green/30",
                          st.completed
                            ? "border-pritio-green bg-pritio-green text-white"
                            : "border-line-strong hover:border-pritio-green hover:ring-2 hover:ring-pritio-green/20",
                        )}
                      >
                        {st.completed && (
                          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <input
                        type="text"
                        value={st.title}
                        onChange={(e) => renameSubtask(st.key, e.target.value)}
                        placeholder="Título de la subtarea"
                        className={cn(
                          "min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted",
                          st.completed && "text-ink-muted line-through",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => removeSubtask(st.key)}
                        aria-label={`Quitar subtarea: ${st.title}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-muted opacity-0 transition-all hover:bg-pritio-coral/10 hover:text-pritio-coral focus-visible:opacity-100 group-hover/sub:opacity-100"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {subtasks.length >= MAX_SUBTASKS_PER_TASK ? (
                    <p className="px-1 py-0.5 text-[11px] font-medium text-pritio-coral">
                      Límite de {MAX_SUBTASKS_PER_TASK} subtareas alcanzado.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 px-1 py-0.5">
                      <span
                        aria-hidden="true"
                        className="grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded-full border-2 border-dashed border-line-strong text-ink-muted"
                      >
                        <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                          <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSubtask();
                          }
                        }}
                        placeholder={`Añadir subtarea… (${subtasks.length}/${MAX_SUBTASKS_PER_TASK})`}
                        aria-label="Nueva subtarea"
                        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <AddRowButton label="Añadir subtareas" onClick={() => setShowSubtasks(true)} />
          )}

          </div>

          {/* Rail de datos adicionales */}
          <aside className="min-w-0 self-start rounded-xl border border-line/70 bg-surface-subtle/40 p-1 md:block">
            <p className="mb-1 px-2 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Detalles
            </p>
            <PropertyRow
              icon={ROW_ICONS.fechas}
              label="Fechas"
              value={fechasSummary}
              emptyText="Sin fecha"
              expanded={openProperty === "fechas"}
              onToggle={() => toggleProperty("fechas")}
            >
              <div className="space-y-2.5 pt-0.5">
                {kind !== "meeting" && (
                  <label className="flex cursor-pointer items-center justify-end gap-1.5 text-xs font-medium text-ink-soft">
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
                {allDay ? (
                  <div className="grid grid-cols-2 gap-2">
                    <DatePickerPopover
                      value={startDate}
                      onChange={setStartDate}
                      placeholder={kind === "meeting" ? "Día de la junta" : kind === "event" ? "Día de inicio" : "Día"}
                      align="right"
                    />
                    <DatePickerPopover value={endDate} onChange={setEndDate} placeholder="Día fin" clearable align="right" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-[11px] font-medium text-ink-muted">Inicio</span>
                      <DatePickerPopover value={startDate} onChange={setStartDate} placeholder="Día" className="min-w-0 flex-1" align="right" />
                      <div className="w-[6.75rem] shrink-0">
                        <TimePicker compact value={startTime} onChange={setStartTime} accent={timeAccent} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 text-[11px] font-medium text-ink-muted">Fin</span>
                      <DatePickerPopover value={endDate} onChange={setEndDate} placeholder="Día" clearable className="min-w-0 flex-1" align="right" />
                      <div className="w-[6.75rem] shrink-0">
                        <TimePicker compact value={endTime} onChange={setEndTime} accent={timeAccent} />
                      </div>
                    </div>
                  </div>
                )}
                {kind === "task" && showDueDate && (
                  <div className="space-y-1.5 border-t border-line/60 pt-2.5">
                    <p className="text-[11px] font-medium text-ink-muted">Fecha límite</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DatePickerPopover
                        value={dueDate}
                        onChange={setDueDate}
                        placeholder="Fecha límite"
                        presets
                        clearable
                        className="min-w-[9rem] flex-1"
                        align="right"
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
                  </div>
                )}
              </div>
            </PropertyRow>

            <PropertyRow
              icon={ROW_ICONS.repetir}
              label="Repetir"
              value={repetirSummary}
              emptyText="No se repite"
              expanded={openProperty === "repetir"}
              onToggle={() => toggleProperty("repetir")}
            >
              <div className="space-y-2 pt-0.5">
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
                    <div className="grid grid-cols-2 gap-2">
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
                      <Field label="Número de repeticiones">
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
            </PropertyRow>

            <PropertyRow
              icon={ROW_ICONS.recordatorios}
              label="Recordatorios"
              value={recordatoriosSummary}
              emptyText="Sin recordatorios"
              expanded={openProperty === "recordatorios"}
              onToggle={() => toggleProperty("recordatorios")}
            >
              <div className="space-y-2 pt-0.5">
                {reminders.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
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
                <div className="space-y-2">
                  <DatePickerPopover
                    value={newReminder.slice(0, 10)}
                    onChange={(d) => setNewReminder(`${d}T${newReminder.slice(11, 16) || "09:00"}`)}
                    placeholder="Día"
                    className="w-full"
                    align="right"
                  />
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <TimePicker
                        compact
                        value={newReminder.slice(11, 16)}
                        onChange={(t) => setNewReminder(`${newReminder.slice(0, 10) || todayStr()}T${t}`)}
                        accent="purple"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (newReminder && !reminders.includes(newReminder)) {
                          setReminders((prev) => [...prev, newReminder]);
                        }
                        setNewReminder("");
                      }}
                      className="shrink-0 rounded-xl bg-pritio-purple px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-pritio-purple/90"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
                {reminderAnchor && (
                  <div className="flex flex-wrap gap-1">
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
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Recibirás una notificación in-app, por correo y push en la fecha elegida.
                </p>
              </div>
            </PropertyRow>

            {projects.length > 0 && (
              <PropertyRow
                icon={ROW_ICONS.proyecto}
                label="Proyecto"
                value={projects.find((p) => p.id === projectId)?.name ?? ""}
                emptyText="Sin proyecto"
                expanded={openProperty === "proyecto"}
                onToggle={() => toggleProperty("proyecto")}
              >
                <div className="space-y-0.5">
                  {projects.map((p) => {
                    const selected = projectId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProjectId(selected ? "" : p.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
                          selected && "bg-pritio-blue/5",
                        )}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                        {selected && (
                          <svg className="h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                            <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setProjectId("")}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
                      !projectId && "bg-pritio-blue/5",
                    )}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-line-strong" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">Sin proyecto</span>
                    {!projectId && (
                      <svg className="h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                        <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </PropertyRow>
            )}

            {assignees.length > 0 && (
              <PropertyRow
                icon={ROW_ICONS.asignados}
                label="Asignados"
                value={asignadosSummary}
                emptyText="Sin asignar"
                expanded={openProperty === "asignados"}
                onToggle={() => toggleProperty("asignados")}
              >
                <div className="space-y-0.5">
                  {assignees
                    .filter((a) => !allowedAssigneeIds || allowedAssigneeIds.has(a.id))
                    .map((a) => {
                      const selected = selectedAssigneeIds.includes(a.id);
                      const isSelfLocked = isRestrictedMember && selfAssignee?.id === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          disabled={selected && isSelfLocked}
                          onClick={() => toggleAssignee(a.id)}
                          title={
                            selected && isSelfLocked
                              ? "Los miembros solo pueden asignarse tareas a sí mismos."
                              : undefined
                          }
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:hover:bg-transparent",
                            selected && "bg-pritio-blue/5",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                              selected ? "bg-pritio-blue text-white" : "bg-surface-muted text-ink-soft",
                            )}
                          >
                            {initialsOf(a.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">{a.name}</span>
                          {selected && (
                            <svg className="h-3.5 w-3.5 shrink-0 text-pritio-blue" viewBox="0 0 16 16" fill="none">
                              <path d="M3.5 8.5l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  {isRestrictedMember && (
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                      Los miembros solo pueden asignarse tareas a sí mismos.
                    </p>
                  )}
                </div>
              </PropertyRow>
            )}

            {/* Visibility row (family workspaces) */}
            {workspaceType === "family" && !isRestrictedMember && (
              <PropertyRow
                icon={ROW_ICONS.visibilidad}
                label="Visibilidad"
                value={visibility === "all" ? "Todos" : "Solo asignados"}
                expanded={openProperty === "visibilidad"}
                onToggle={() => toggleProperty("visibilidad")}
              >
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVisibility("assigned")}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
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
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                        visibility === "all"
                          ? "border-pritio-blue bg-pritio-blue/5 text-pritio-blue"
                          : "border-line bg-surface text-ink-soft hover:bg-surface-muted",
                      )}
                    >
                      Visible para todos
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-muted">
                    {visibility === "all"
                      ? "Todos los miembros de la familia pueden ver este elemento."
                      : "Solo los miembros asignados podrán ver este elemento."}
                  </p>
                </div>
              </PropertyRow>
            )}

            {/* Comentarios */}
            {isEdit && (
              <PropertyRow
                icon={ROW_ICONS.comentarios}
                label="Comentarios"
                value={
                  comments.length > 0
                    ? `${comments.length} comentario${comments.length > 1 ? "s" : ""}`
                    : ""
                }
                emptyText="Sin comentarios"
                expanded={openProperty === "comentarios"}
                onToggle={() => toggleProperty("comentarios")}
              >
                <div className="max-h-[16rem] space-y-2.5 overflow-y-auto pt-0.5">
                  {comments.length === 0 && (
                    <p className="text-xs text-ink-muted">Aún no hay comentarios.</p>
                  )}
                  {comments.map((c) => (
                    <div key={c.id} className="group/c flex items-start gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-muted text-[10px] font-bold text-ink-soft">
                        {initialsOf(c.authorName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-1.5">
                          <span className="text-xs font-bold text-ink">{c.authorName}</span>
                          <time className="text-[11px] text-ink-muted">{formatRelativeTime(c.createdAt)}</time>
                        </p>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
                          {c.body}
                        </p>
                      </div>
                      {c.userId === profile?.id && (
                        <button
                          type="button"
                          onClick={() => void removeComment(c.id)}
                          aria-label="Eliminar comentario"
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-muted opacity-0 transition-all hover:bg-pritio-coral/10 hover:text-pritio-coral focus-visible:opacity-100 group-hover/c:opacity-100"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitComment();
                      }
                    }}
                    rows={2}
                    placeholder="Escribe un comentario…"
                    aria-label="Nuevo comentario"
                    className="w-full resize-none rounded-xl border border-line bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-pritio-blue focus:outline-none focus:ring-2 focus:ring-pritio-blue/20"
                  />
                  {commentSaving && <p className="text-[11px] text-ink-muted">Enviando…</p>}
                </div>
              </PropertyRow>
            )}

            {/* Approval switch (only when workspace has members) */}
            {assignees.length > 0 && (
              <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-2.5 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Requiere aprobación</p>
                  <p className="text-[11px] leading-relaxed text-ink-muted">
                    Un líder deberá aprobar esta tarea antes de que se active.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={requiresApproval}
                  onClick={() => setRequiresApproval((v) => !v)}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    requiresApproval ? "bg-pritio-blue" : "border border-line-strong bg-surface-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all",
                      requiresApproval ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            )}
          </aside>
        </div>

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-8 flex gap-3 border-t border-line bg-surface px-5 pb-4 pt-4 md:-mx-6 md:-mb-6 md:px-6 md:pb-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-surface-muted sm:flex-none"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="min-w-0 flex-1 truncate rounded-xl bg-pritio-blue px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-pritio-blue/90 disabled:opacity-50 sm:flex-none"
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
        description={`Al cambiar de ${KIND_LABELS[task?.kind ?? "task"]} a ${KIND_LABELS[pendingKind ?? "task"]} se reorganizarán las fechas. ¿Estás seguro?`}
        confirmLabel="Cambiar"
      />
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelect={(template) => {
          setTemplatePickerOpen(false);
          setDocsPickerOpen(false);
          void createLinkedDoc(template);
        }}
        workspaceId={currentWorkspace?.id ?? ""}
      />
    </div>,
    document.body,
  );
}
