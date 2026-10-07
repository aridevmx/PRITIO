import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn, localDateStr, isNotesEmpty, stripHtml, todayStr } from "@/lib/utils";
import { Field } from "@/components/Field";
import { SegmentedControl, type SegmentedOption } from "@/components/SegmentedControl";
import { PropertyRow } from "@/components/PropertyRow";
import { QuickDatePicker } from "@/components/QuickDatePicker";
import { DatePickerField } from "@/components/DatePickerField";
import { usePopover } from "@/hooks/usePopover";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import { QUADRANT_ICONS } from "@/features/tasks/quadrantIcons";
import { AppIcon } from "@/components/AppIcon";
import {
  ArrowsClockwise,
  Bell,
  CalendarBlank,
  CalendarPlus,
  CaretDown,
  CaretRight,
  ChatCircle,
  Check,
  Clock,
  File,
  FolderSimple,
  ListChecks,
  Lock,
  Plus,
  Users,
  X,
} from "@phosphor-icons/react";
import { SubtaskContextMenu } from "@/features/tasks/SubtaskContextMenu";
import { allowedKindsForWorkspace } from "@/features/tasks/kinds";
import { useWorkspace } from "@/features/workspaces/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import { supabase } from "@/lib/supabase";
import { createTask as apiCreateTask, updateTask as apiUpdateTask, listSubtasks, createSubtasks, updateSubtask, deleteSubtasks, listComments, createComment, deleteComment, listTaskReminders, saveTaskReminders, type TaskComment } from "@/features/tasks/api";
import { listDocsForTask, listDocs, linkDocToTask, unlinkDocFromTask, createDoc } from "@/features/docs/api";
import { TemplatePicker } from "@/features/docs/TemplatePicker";
import { ProjectPicker } from "@/features/projects/ProjectPicker";
import { AssigneePicker } from "@/features/tasks/AssigneePicker";
import { createProject } from "@/features/projects/api";
import { PRESET_COLORS } from "@/features/projects/presetColors";
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
  startDate: string;
  dueDate: string;
  quadrant: Quadrant | null;
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
    >
      <AppIcon glyph={Plus} />
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
  originals: Map<
    string,
    { title: string; completed: boolean; startDate: string; dueDate: string; quadrant: Quadrant | null }
  >,
): Promise<void> {
  const currentIds = new Set(drafts.filter((d) => d.id).map((d) => d.id as string));
  const toDelete = [
    ...[...originals.keys()].filter((id) => !currentIds.has(id)),
    ...drafts.filter((d) => d.id && !d.title.trim()).map((d) => d.id as string),
  ];
  await deleteSubtasks(toDelete);

  const toCreate: {
    title: string;
    completed: boolean;
    position: number;
    startDate: string;
    dueDate: string;
    quadrant: Quadrant | null;
  }[] = [];
  const updates: Promise<void>[] = [];
  drafts.forEach((draft, index) => {
    const cleanTitle = draft.title.trim();
    if (!draft.id) {
      if (cleanTitle)
        toCreate.push({
          title: cleanTitle,
          completed: draft.completed,
          position: index,
          startDate: draft.startDate,
          dueDate: draft.dueDate,
          quadrant: draft.quadrant,
        });
      return;
    }
    if (!cleanTitle) return; // ya va en toDelete
    const original = originals.get(draft.id);
    if (
      original &&
      original.title === cleanTitle &&
      original.completed === draft.completed &&
      original.startDate === draft.startDate &&
      original.dueDate === draft.dueDate &&
      original.quadrant === draft.quadrant
    ) {
      return;
    }
    updates.push(
      updateSubtask(draft.id, {
        title: cleanTitle,
        completed: draft.completed,
        position: index,
        startDate: draft.startDate,
        dueDate: draft.dueDate,
        quadrant: draft.quadrant,
      }),
    );
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
    icon: <AppIcon glyph={ListChecks} />,
  },
  meeting: {
    activeClassName: "text-pritio-purple",
    icon: <AppIcon glyph={CalendarBlank} />,
  },
  event: {
    activeClassName: "text-pritio-coral",
    icon: <AppIcon glyph={CalendarPlus} />,
  },
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
  fechas: <AppIcon glyph={CalendarBlank} size="sm" />,
  repetir: <AppIcon glyph={ArrowsClockwise} size="sm" />,
  recordatorios: <AppIcon glyph={Bell} size="sm" />,
  proyecto: <AppIcon glyph={FolderSimple} size="sm" />,
  asignados: <AppIcon glyph={Users} size="sm" />,
  visibilidad: <AppIcon glyph={Lock} size="sm" />,
  comentarios: <AppIcon glyph={ChatCircle} size="sm" />,
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
  const [myDayOn, setMyDayOn] = useState(false);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [subtasksExpanded, setSubtasksExpanded] = useState(true);
  const [editingSubtaskKey, setEditingSubtaskKey] = useState<string | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [linkedDocs, setLinkedDocs] = useState<{ id: string; title: string }[]>([]);
  const [workspaceDocs, setWorkspaceDocs] = useState<{ id: string; title: string }[]>([]);
  const [pendingDocIds, setPendingDocIds] = useState<string[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(true);
  const {
    anchorRef: docsAnchorRef,
    panelRef: docsPanelRef,
    open: docsPickerOpen,
    toggle: toggleDocsPicker,
    setOpen: setDocsPickerOpen,
    pos: docsPickerPos,
  } = usePopover<HTMLButtonElement>({ align: "left", offset: 4 });
  const subtaskKeyCounter = useRef(0);
  const originalSubtasksRef = useRef<
    Map<string, { title: string; completed: boolean; startDate: string; dueDate: string; quadrant: Quadrant | null }>
  >(new Map());

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

  const spaceLabel = useMemo(() => {
    const t = currentWorkspace?.type;
    if (t === "personal") return "Personal";
    if (!currentWorkspace?.name) return "Mis proyectos";
    return t === "family" ? currentWorkspace.name : `Equipo: ${currentWorkspace.name}`;
  }, [currentWorkspace]);

  const handleCreateProject = useCallback(
    async (name: string) => {
      if (!currentWorkspace?.id || !canCreate("projects")) return;
      const color = PRESET_COLORS[name.length % PRESET_COLORS.length];
      try {
        const created = await createProject(currentWorkspace.id, name, color);
        setProjects((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, created]));
        setProjectId(created.id);
        toast.success("Proyecto creado");
      } catch (err) {
        const resource = parsePlanLimitError(err);
        if (resource) {
          openUpgrade(resource);
          return;
        }
        toast.error("Error al crear proyecto");
      }
    },
    [currentWorkspace?.id, canCreate, toast],
  );

  const applyKind = (k: TaskKind) => {
    setKind(k);
    if (!startDate && dueDate) setStartDate(dueDate);
  };

  const handleToggleMyDay = useCallback(async () => {
    if (!task || saving) return;
    const next = !myDayOn;
    setMyDayOn(next);
    try {
      const updated = await apiUpdateTask(task.id, { myDayDate: next ? todayStr() : null });
      window.dispatchEvent(
        new CustomEvent("pritio:tasks-changed", {
          detail: { task: updated, workspaceId: updated.workspaceId },
        }),
      );
    } catch {
      setMyDayOn(!next);
      toast.error("No se pudo actualizar Mi día");
    }
  }, [task, myDayOn, saving, toast]);

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

  const timeAccent: "blue" | "purple" | "coral" =
    kind === "meeting" ? "purple" : kind === "event" ? "coral" : "blue";
  const toggleProperty = useCallback((key: string) => {
    setOpenProperty((cur) => (cur === key ? null : key));
  }, []);

  const repetirSummary = recurrenceFreq ? (RECURRENCE_LABELS[recurrenceFreq] ?? "") : "";

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
        setMyDayOn(task.myDayDate === todayStr());
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
        setMyDayOn(false);
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
          const originals = new Map<
            string,
            { title: string; completed: boolean; startDate: string; dueDate: string; quadrant: Quadrant | null }
          >();
          rows.forEach((r) =>
            originals.set(r.id, {
              title: r.title,
              completed: r.completed,
              startDate: r.startDate ?? "",
              dueDate: r.dueDate ?? "",
              quadrant: r.quadrant ?? null,
            }),
          );
          originalSubtasksRef.current = originals;
          setSubtasks(
            rows.map((r) => ({
              key: r.id,
              id: r.id,
              title: r.title,
              completed: r.completed,
              startDate: r.startDate ?? "",
              dueDate: r.dueDate ?? "",
              quadrant: r.quadrant ?? null,
            })),
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
  }, [open, task, currentWorkspace?.id, setDocsPickerOpen]);

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
      {
        key: `tmp-${subtaskKeyCounter.current}-${Date.now()}`,
        id: null,
        title: t,
        completed: false,
        startDate: "",
        dueDate: "",
        quadrant: null,
      },
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

  const setSubtaskStartDate = (key: string, date: string | null) =>
    setSubtasks((prev) => prev.map((s) => (s.key === key ? { ...s, startDate: date ?? "" } : s)));

  const setSubtaskDueDate = (key: string, date: string | null) =>
    setSubtasks((prev) => prev.map((s) => (s.key === key ? { ...s, dueDate: date ?? "" } : s)));

  const setSubtaskQuadrant = (key: string, q: Quadrant | null) =>
    setSubtasks((prev) => prev.map((s) => (s.key === key ? { ...s, quadrant: q } : s)));

  const duplicateSubtask = (key: string) => {
    if (subtasks.length >= MAX_SUBTASKS_PER_TASK) {
      toast.error(`Una tarea puede tener máximo ${MAX_SUBTASKS_PER_TASK} subtareas`);
      return;
    }
    const index = subtasks.findIndex((s) => s.key === key);
    if (index < 0) return;
    const src = subtasks[index];
    subtaskKeyCounter.current += 1;
    setSubtasks((prev) => {
      const copy = [...prev];
      copy.splice(index + 1, 0, {
        key: `tmp-${subtaskKeyCounter.current}-${Date.now()}`,
        id: null,
        title: src.title,
        completed: src.completed,
        startDate: src.startDate,
        dueDate: src.dueDate,
        quadrant: src.quadrant,
      });
      return copy;
    });
  };

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
          inboxed: false,
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
    selectedAssigneeIds, pendingDocIds,
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
                <AppIcon glyph={Check} size="xs" />
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
            <AppIcon glyph={X} />
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

          {/* Subtareas (contraíbles) */}
          {subtasks.length > 0 || showSubtasks ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSubtasksExpanded((v) => !v)}
                aria-expanded={subtasksExpanded}
                className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-muted"
              >
                <AppIcon
                  glyph={CaretRight}
                  size="xs"
                  className={cn(
                    "shrink-0 text-ink-muted transition-transform duration-200",
                    subtasksExpanded && "rotate-90",
                  )}
                />
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
                            <AppIcon glyph={Check} size="xs" />
                          )}
                      </button>
                      <input
                        type="text"
                        value={st.title}
                        autoFocus={editingSubtaskKey === st.key}
                        onBlur={() => setEditingSubtaskKey((cur) => (cur === st.key ? null : cur))}
                        onChange={(e) => renameSubtask(st.key, e.target.value)}
                        placeholder="Título de la subtarea"
                        className={cn(
                          "min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted",
                          st.completed && "text-ink-muted line-through",
                        )}
                      />
                      <SubtaskContextMenu
                        subtask={{
                          key: st.key,
                          id: st.id,
                          title: st.title,
                          completed: st.completed,
                          startDate: st.startDate || null,
                          dueDate: st.dueDate || null,
                          quadrant: st.quadrant,
                        }}
                        onEdit={() => setEditingSubtaskKey(st.key)}
                        onSetStartDate={(d) => setSubtaskStartDate(st.key, d)}
                        onSetDueDate={(d) => setSubtaskDueDate(st.key, d)}
                        onSetQuadrant={(q) => setSubtaskQuadrant(st.key, q)}
                        onDuplicate={() => duplicateSubtask(st.key)}
                        onDelete={() => removeSubtask(st.key)}
                      />
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
                        <AppIcon glyph={Plus} size="xs" />
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

          {/* Comentarios — en la columna principal */}
          {isEdit && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setCommentsExpanded((c) => !c)}
                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted transition-colors hover:text-ink"
              >
                Comentarios
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-soft">
                  {comments.length}
                </span>
                <AppIcon
                  glyph={CaretDown}
                  size="sm"
                  className={cn("transition-transform", commentsExpanded && "rotate-180")}
                />
              </button>

              {/* Input directo, siempre visible */}
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

              {commentsExpanded && comments.length > 0 && (
                <div className="max-h-[12rem] space-y-2.5 overflow-y-auto pr-0.5">
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
                          <AppIcon glyph={X} size="sm" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {commentsExpanded && comments.length === 0 && (
                <p className="text-xs text-ink-muted">Aún no hay comentarios.</p>
              )}
            </div>
          )}
          </div>

          {/* Rail de datos adicionales */}
          <aside className="min-w-0 self-start space-y-5 rounded-xl border border-line/70 bg-surface-subtle/40 p-3 md:block">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Detalles
            </p>

            {task && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-2.5 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <AppIcon glyph={Clock} className="shrink-0 text-pritio-purple" />
                    Mi día
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                    {myDayOn ? "Aparece en Mi día de hoy" : "Agrega la tarea a tu día de hoy"}
                  </p>
                  <p className="text-[10px] text-ink-muted/80">Se limpia sola cada 24 h.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={myDayOn}
                  onClick={() => void handleToggleMyDay()}
                  disabled={saving}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
                    myDayOn ? "bg-pritio-purple" : "border border-line-strong bg-surface-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all",
                      myDayOn ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
            )}

            {/* Fechas — campos directos, sin collapsible */}
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Fechas</p>

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
                  <DatePickerField
                    field="fecha-inicio"
                    value={startDate}
                    onChange={(d) => setStartDate(d ?? "")}
                    showTime={false}
                    accent={timeAccent}
                    placeholder={kind === "meeting" ? "Día de la junta" : kind === "event" ? "Día de inicio" : "Día"}
                  />
                  <DatePickerField
                    field="fecha-fin"
                    value={endDate}
                    onChange={(d) => setEndDate(d ?? "")}
                    showTime={false}
                    accent={timeAccent}
                    placeholder="Día fin"
                    minDate={startDate || undefined}
                    error={
                      startDate && endDate && endDate < startDate
                        ? "El fin no puede ser anterior al inicio"
                        : undefined
                    }
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[11px] font-medium text-ink-muted">Inicio</span>
                    <DatePickerField
                      field="fecha-inicio"
                      value={startDate}
                      time={startTime}
                      onChange={(d, t) => {
                        setStartDate(d ?? "");
                        if (t !== undefined) setStartTime(t);
                      }}
                      showTime
                      accent={timeAccent}
                      placeholder={kind === "meeting" ? "Día de la junta" : kind === "event" ? "Día de inicio" : "Día"}
                      className="min-w-0 flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-[11px] font-medium text-ink-muted">Fin</span>
                    <DatePickerField
                      field="fecha-fin"
                      value={endDate}
                      time={endTime}
                      onChange={(d, t) => {
                        setEndDate(d ?? "");
                        if (t !== undefined) setEndTime(t);
                      }}
                      showTime
                      accent={timeAccent}
                      placeholder="Día fin"
                      minDate={startDate || undefined}
                      className="min-w-0 flex-1"
                      error={
                        startDate && endDate && endDate < startDate
                          ? "El fin no puede ser anterior al inicio"
                          : undefined
                      }
                    />
                  </div>
                </div>
              )}

              {kind === "task" && showDueDate && (
                <div className="space-y-1.5 border-t border-line/60 pt-2">
                  <p className="text-[11px] font-medium text-ink-muted">Fecha límite</p>
                  <DatePickerField
                    field="fecha-limite"
                    value={dueDate}
                    onChange={(d) => setDueDate(d ?? "")}
                    showTime={false}
                    minDate={endDate || startDate || undefined}
                    placeholder="Sin fecha límite"
                    error={
                      endDate && dueDate && dueDate < endDate
                        ? "La fecha límite no puede ser anterior al fin"
                        : undefined
                    }
                  />
                </div>
              )}
            </div>

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

            {/* Recordatorios — input con select, directo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Recordatorios</p>
                {reminders.length > 0 && (
                  <span className="text-[11px] font-semibold tabular-nums text-pritio-purple">
                    {reminders.length}
                  </span>
                )}
              </div>

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
                        <AppIcon glyph={X} size="xs" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <QuickDatePicker
                    date={newReminder.slice(0, 10)}
                    time={newReminder.slice(11, 16)}
                    onChange={(d, t) => setNewReminder(`${d}T${t || "09:00"}`)}
                    accent="purple"
                    placeholder="Día del recordatorio"
                    className="min-w-0 flex-1"
                  />
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (newReminder && !reminders.includes(newReminder)) {
                        setReminders((prev) => [...prev, newReminder]);
                      }
                      setNewReminder("");
                    }}
                    className="min-w-0 flex-1 truncate rounded-lg bg-pritio-purple px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-pritio-purple/90"
                  >
                    Agregar
                  </button>
                  {reminderAnchor && (
                    <div className="flex min-w-0 flex-1 gap-1">
                      {[
                        { label: "15 min", minutes: 15 },
                        { label: "1 h", minutes: 60 },
                        { label: "1 día", minutes: 1440 },
                      ].map((p) => {
                        const v = reminderWithOffset(reminderAnchor, p.minutes);
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => {
                              if (v && !reminders.includes(v)) setReminders((prev) => [...prev, v]);
                            }}
                            className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-soft transition-all hover:bg-surface-muted"
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-ink-muted">
                  Notificación in-app, por correo y push en la fecha elegida.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Proyecto</p>
              <ProjectPicker
                value={projectId}
                onChange={(id) => setProjectId(id)}
                projects={projects}
                spaceLabel={spaceLabel}
                canCreate={canCreate("projects")}
                onCreate={(name) => void handleCreateProject(name)}
              />
            </div>

            {assignees.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Asignados</p>
              <AssigneePicker
                value={selectedAssigneeIds}
                onChange={(ids) => setSelectedAssigneeIds(ids)}
                onToggle={toggleAssignee}
                assignees={assignees}
                allowedIds={allowedAssigneeIds}
                lockedIds={
                  isRestrictedMember && selfAssignee ? new Set([selfAssignee.id]) : undefined
                }
              />
            </div>
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

            {/* Documentos vinculados — a la derecha */}
            <div className="space-y-2 border-t border-line/60 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">Documentos</p>
              {linkedDocs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {linkedDocs.map((d) => (
                    <span
                      key={d.id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-subtle py-1 pl-2 pr-1.5 text-xs font-medium text-ink"
                    >
                      <AppIcon glyph={File} size="xs" className="shrink-0 text-ink-muted" />
                      <span className="max-w-[7rem] truncate">{d.title || "Sin título"}</span>
                      <button
                        type="button"
                        onClick={() => void toggleDocLink(d.id)}
                        aria-label={`Desvincular documento: ${d.title || "Sin título"}`}
                        className="text-ink-muted transition-colors hover:text-pritio-coral"
                      >
                        <AppIcon glyph={X} size="xs" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button
                ref={docsAnchorRef}
                type="button"
                onClick={toggleDocsPicker}
                aria-expanded={docsPickerOpen}
                className="w-full rounded-full border border-dashed border-line-strong/70 px-2.5 py-1 text-left text-xs font-medium text-ink-soft transition-colors hover:border-pritio-blue/50 hover:text-pritio-blue"
              >
                + Vincular documento
              </button>
            </div>
          </aside>
        </div>

        {docsPickerOpen &&
          createPortal(
            <div
              ref={docsPanelRef}
              data-pritio-popover="true"
              role="dialog"
              aria-label="Vincular documento"
              style={{
                top: docsPickerPos?.top ?? -9999,
                left: docsPickerPos?.left ?? -9999,
                visibility: docsPickerPos ? "visible" : "hidden",
              }}
              className="pritio-menu-enter fixed z-[10002] w-[19rem] max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-surface p-2 shadow-elevated"
            >
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
                        <AppIcon glyph={Check} size="xs" className="shrink-0 text-pritio-blue" />
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
                <AppIcon glyph={Plus} />
                Crear nota y vincular
              </button>
            </div>,
            document.body,
          )}

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
