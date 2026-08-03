import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { formatRelativeTime, isOverdue, getDueText, isDueToday, formatDate } from "@/features/tasks/dates";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import type { Task } from "@/types";

interface TaskCardProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onArchive?: (task: Task) => void;
  isDragging?: boolean;
  responsableName?: string;
  creatorName?: string;
}

export function TaskCard({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  onArchive,
  isDragging,
  responsableName,
  creatorName,
}: TaskCardProps) {
  const overdue = isOverdue(task);
  const dueToday = isDueToday(task);
  const timeFormat = useTimeFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, transform, isDragging: isBeingDragged } = useDraggable({ id: task.id });

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-sm transition-all hover:shadow-soft cursor-grab active:cursor-grabbing",
        (isDragging || isBeingDragged) && "opacity-50 shadow-elevated ring-2 ring-prio-blue/30",
        task.completed && "opacity-50",
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete(task);
        }}
        className={cn(
          "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all",
          task.completed
            ? "border-prio-green bg-prio-green text-white"
            : "border-line hover:border-prio-green",
        )}
      >
        {task.completed && (
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

      {/* Body */}
      <button
        type="button"
        onClick={() => onEdit(task)}
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        {/* Title line */}
        <div className="flex items-center gap-1.5">
          {task.kind === "meeting" && (
            <svg className="h-4 w-4 shrink-0 text-prio-purple" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
          <span className={cn("font-semibold text-sm text-ink leading-snug", task.completed && "line-through text-ink-muted")}>
            {task.title}
          </span>
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-ink-soft line-clamp-2">{task.description}</p>
        )}

        {/* Tags row */}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {responsableName && (
            <span className="inline-flex items-center gap-0.5 rounded-md border border-line bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
              {"★"} {responsableName}
            </span>
          )}
        </div>

        {/* Metadata + overtime */}
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-ink-soft">
          {creatorName && (
            <span>Creada por {creatorName}</span>
          )}
          <span>{"·"} {formatRelativeTime(task.createdAt)}</span>
          {task.completed && task.completedAt && (
            <span className="text-prio-green">
              {"·"} Completada {formatDate(task.completedAt)}
            </span>
          )}
          {overdue && (
            <span className="text-prio-coral">
              {"·"} {getDueText(task.dueDate!).label}
            </span>
          )}
        </div>

        {/* Pills row */}
        {task.kind === "meeting" ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {task.startAt
                ? (() => {
                    const start = new Date(task.startAt);
                    return formatTime(start, timeFormat);
                  })()
                : "Junta"}
              {task.endAt && (
                <> - {formatTime(new Date(task.endAt), timeFormat)}</>
              )}
            </span>
            {task.location && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1.5C4 1.5 2.5 3 2.5 5C2.5 7.5 6 10.5 6 10.5C6 10.5 9.5 7.5 9.5 5C9.5 3 8 1.5 6 1.5Z" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="6" cy="5" r="1.5" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                {task.location}
              </span>
            )}
            {task.meetingLink && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path d="M4.5 7.5L7.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M5.5 8L4 9.5C3.5 10 2.5 10 2 9.5C1.5 9 1.5 8 2 7.5L3.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M6.5 4L8 2.5C8.5 2 9.5 2 10 2.5C10.5 3 10.5 4 10 4.5L8.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Enlace
              </span>
            )}
            {task.dueDate && (
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                overdue
                  ? "bg-prio-coral/10 text-prio-coral"
                  : dueToday
                    ? "bg-amber-50 text-amber-600"
                    : "bg-amber-50 text-amber-600",
              )}>
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <rect x="1.5" y="2.5" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1.5 5.5H10.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {getDueText(task.dueDate).label}
              </span>
            )}
          </div>
        ) : (
          task.dueDate && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                overdue
                  ? "bg-prio-coral/10 text-prio-coral"
                  : "bg-amber-50 text-amber-600",
              )}>
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <rect x="1.5" y="2.5" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1.5 5.5H10.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M8 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {getDueText(task.dueDate).label}
              </span>
            </div>
          )
        )}
      </button>

      {/* Three-dot menu */}
      <div className="relative shrink-0 self-start" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted opacity-0 transition-all hover:bg-surface-muted hover:text-ink-soft group-hover:opacity-100"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13" r="1.5" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-elevated">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onEdit(task); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-muted"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M2 12V14H4L12 6L10 4L2 12Z" fill="currentColor" opacity="0.6" />
              </svg>
              Editar
            </button>
            {task.completed && onArchive && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onArchive(task); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-muted"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4L3 3H13L14 4V6L12 13H4L2 6V4Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 4H14" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                Archivar
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDelete(task); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-prio-coral hover:bg-prio-coral/5"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4H13M5.5 4V3C5.5 2.5 6 2 6.5 2H9.5C10 2 10.5 2.5 10.5 3V4M7 7V11M9 7V11M6 4H10L10.5 5.5L11 13H5L5.5 5.5L6 4Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
