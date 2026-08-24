import { useState, useRef, useEffect } from "react";
import { cn, stripHtml } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { isOverdue, isDueToday } from "@/features/tasks/dates";
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

function nameHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

function AssigneeDot({ name }: { name: string }) {
  const hue = nameHue(name);
  return (
    <span
      title={name}
      aria-label={`Responsable: ${name}`}
      className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold leading-none ring-1 ring-black/5"
      style={{
        backgroundColor: `hsl(${hue} 45% 90%)`,
        color: `hsl(${hue} 45% 32%)`,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function MetaIcon({
  title,
  label,
  className,
  children,
}: {
  title: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      role="img"
      aria-label={label}
      className={cn("grid h-5 w-5 shrink-0 place-items-center", className)}
    >
      {children}
    </span>
  );
}

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.5 6.5H14.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 1V4M11 1V4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ClockGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5V8.5L10.5 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function RepeatGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M12.5 8a4.5 4.5 0 0 1-7.5 3.3M3.5 8a4.5 4.5 0 0 1 7.5-3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.5 3.5V5.5H10.5M3.5 12.5V10.5H5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  yearly: "Anual",
};

export function TaskCard({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  onArchive,
  isDragging,
  responsableName,
}: TaskCardProps) {
  const overdue = isOverdue(task);
  const dueToday = isDueToday(task);
  const timeFormat = useTimeFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );
  const { attributes, listeners, setNodeRef, transform, isDragging: isBeingDragged } = useDraggable({
    id: task.id,
    disabled: isCoarse,
  });

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

  const dueLabel = overdue
    ? `Atrasada · Vence: ${task.dueDate}`
    : `Vence: ${task.dueDate ?? ""}`;
  const shortDate = task.dueDate ? task.dueDate.split("-").slice(1).reverse().join("/") : "";
  const recurrenceLabel = task.recurrenceFreq
    ? `${RECURRENCE_LABELS[task.recurrenceFreq] ?? task.recurrenceFreq}${
        task.recurrenceInterval > 1 ? ` cada ${task.recurrenceInterval}` : ""
      }`
    : "";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={0}
      aria-label={`Editar tarea: ${task.title}`}
      onClick={() => onEdit(task)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(task);
        }
      }}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        "group relative cursor-grab rounded-xl border bg-surface px-3 py-2.5 text-left shadow-soft transition-all duration-150 active:cursor-grabbing",
        "hover:-translate-y-px hover:border-line-strong hover:shadow-elevated",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-blue/40",
        overdue && !task.completed && "border-pritio-coral/25",
        (isDragging || isBeingDragged) && "opacity-50 shadow-elevated ring-2 ring-pritio-blue/30",
        task.completed && "opacity-55",
      )}
    >
      {overdue && !task.completed && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl bg-pritio-coral/[0.04]"
        />
      )}

      <div className="flex items-start gap-2.5">
        {/* Checkbox */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(task);
          }}
          className={cn(
            "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pritio-green/30",
            task.completed
              ? "border-pritio-green bg-pritio-green text-white"
              : "border-line-strong hover:border-pritio-green hover:ring-2 hover:ring-pritio-green/20",
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
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm font-semibold leading-snug text-ink line-clamp-2",
              task.completed && "line-through text-ink-muted",
            )}
          >
            {task.kind === "meeting" && (
              <svg
                className="mr-1.5 inline-block h-3.5 w-3.5 text-pritio-purple"
                viewBox="0 0 12 12"
                fill="none"
                aria-label="Junta"
              >
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 3.5V6.5L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
            {task.title}
          </span>

          {(() => {
            const descriptionText = stripHtml(task.description);
            return descriptionText ? (
              <p
                className={cn(
                  "mt-1 text-xs leading-snug text-ink-soft line-clamp-1",
                  task.completed && "line-through",
                )}
              >
                {descriptionText}
              </p>
            ) : null;
          })()}
        </div>

        {/* Three-dot menu */}
        <div className="relative shrink-0 self-start" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            aria-label="Acciones"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft transition-all hover:bg-surface-muted hover:text-ink md:opacity-0 md:group-hover:opacity-100"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="pritio-menu-enter absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-elevated"
            >
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-pritio-coral hover:bg-pritio-coral/5"
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

      {/* Fechas · horarios · recurrencia */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-8">
        {task.dueDate &&
          (overdue ? (
            <span
              title={dueLabel}
              className="inline-flex items-center gap-1 rounded-full bg-pritio-coral/10 px-2 py-0.5 text-[10px] font-bold text-pritio-coral"
            >
              <CalendarGlyph className="h-3 w-3" />
              Atrasada
            </span>
          ) : dueToday ? (
            <span
              title={dueLabel}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600"
            >
              <CalendarGlyph className="h-3 w-3" />
              Hoy
            </span>
          ) : (
            <span title={dueLabel} className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted">
              <CalendarGlyph className="h-3.5 w-3.5" />
              {shortDate}
            </span>
          ))}

        {task.startAt && (
          <span
            title="Hora programada"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-pritio-blue"
          >
            <ClockGlyph className="h-3.5 w-3.5" />
            {formatTime(new Date(task.startAt), timeFormat)}
          </span>
        )}

        {recurrenceLabel && (
          <span
            title="Recurrente"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted"
          >
            <RepeatGlyph className="h-3.5 w-3.5" />
            {recurrenceLabel}
          </span>
        )}

        {!!task.subtaskTotal && task.subtaskTotal > 0 && (
          <span
            title={`Subtareas: ${task.subtaskCompleted ?? 0} de ${task.subtaskTotal} completadas`}
            aria-label={`Subtareas: ${task.subtaskCompleted ?? 0} de ${task.subtaskTotal} completadas`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              (task.subtaskCompleted ?? 0) >= task.subtaskTotal
                ? "bg-pritio-green/10 text-pritio-green"
                : "bg-surface-muted text-ink-muted",
            )}
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 8.25L7.25 10.5L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {task.subtaskCompleted ?? 0}/{task.subtaskTotal}
          </span>
        )}

        {task.kind === "meeting" && task.location && (
          <MetaIcon title={`Presencial · ${task.location}`} label={`Presencial · ${task.location}`} className="h-4 text-ink-muted">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6C3.5 9.5 8 14.5 8 14.5C8 14.5 12.5 9.5 12.5 6C12.5 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </MetaIcon>
        )}

        {task.kind === "meeting" && task.meetingLink && (
          <a
            href={task.meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir enlace de la junta"
            aria-label="Abrir enlace de la junta"
            className="grid h-4 w-4 shrink-0 place-items-center text-pritio-blue transition-colors hover:text-pritio-purple"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 9.5L9.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M7 10.5L5 12.5C4.2 13.3 2.9 13.3 2.1 12.5C1.3 11.7 1.3 10.4 2.1 9.6L4 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M9 5.5L11 3.5C11.8 2.7 13.1 2.7 13.9 3.5C14.7 4.3 14.7 5.6 13.9 6.4L12 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </a>
        )}

        {task.requiresApproval && (
          <MetaIcon
            title={
              task.approved
                ? "Aprobada"
                : task.rejected
                  ? `Rechazada · ${task.rejectionReason ?? "sin motivo"}`
                  : "Pendiente de aprobación"
            }
            label={
              task.approved
                ? "Aprobada"
                : task.rejected
                  ? "Rechazada"
                  : "Pendiente de aprobación"
            }
            className={cn(
              "h-4",
              task.approved
                ? "text-pritio-green"
                : task.rejected
                  ? "text-pritio-coral"
                  : "text-amber-600",
            )}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
              {task.approved ? (
                <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              ) : task.rejected ? (
                <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <>
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 4.5V8.5L10.5 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </>
              )}
            </svg>
          </MetaIcon>
        )}

        <span className="flex-1" />

        {responsableName && <AssigneeDot name={responsableName} />}
      </div>
    </div>
  );
}
