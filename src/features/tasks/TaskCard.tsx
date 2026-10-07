import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn, stripHtml } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { isOverdue, isDueToday } from "@/features/tasks/dates";
import { formatTime, useTimeFormat } from "@/lib/timeFormat";
import type { Task } from "@/types";
import { AppIcon } from "@/components/AppIcon";
import {
  Archive,
  ArrowsClockwise,
  CalendarBlank,
  Check,
  Clock,
  DotsThreeVertical,
  Link,
  ListChecks,
  MapPin,
  PencilSimple,
  Trash,
  X,
} from "@phosphor-icons/react";

interface TaskCardProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onArchive?: (task: Task) => void;
  isDragging?: boolean;
  responsableName?: string;
  creatorName?: string;
  workspaceName?: string;
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
  workspaceName,
}: TaskCardProps) {
  const overdue = isOverdue(task);
  const dueToday = isDueToday(task);
  const timeFormat = useTimeFormat();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [isCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );
  const { attributes, listeners, setNodeRef, transform, isDragging: isBeingDragged } = useDraggable({
    id: task.id,
    disabled: isCoarse,
  });

  useEffect(() => {
    if (!menuOpen || !btnRef.current) return;

    const updatePosition = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const menuWidth = 140; // min-w-[140px]
      const viewportWidth = window.innerWidth;
      const left = Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 16);
      setMenuPosition({
        top: rect.bottom + 4, // mt-1 = 4px
        left: Math.max(left, 16),
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        (e.target as HTMLElement).closest("[data-task-menu]") === null
      ) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
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

  const menuContent = (
    <div
      data-task-menu
      className="pritio-menu-enter z-[100] min-w-[140px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-elevated"
      style={{
        position: "fixed",
        top: menuPosition?.top ?? 0,
        left: menuPosition?.left ?? 0,
        width: menuPosition?.width ?? 140,
      }}
    >
      <button
        type="button"
        onClick={() => { setMenuOpen(false); onEdit(task); }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-surface-muted"
      >
        <AppIcon glyph={PencilSimple} size="sm" />
        Editar
      </button>
      {task.completed && onArchive && (
        <button
          type="button"
          onClick={() => { setMenuOpen(false); onArchive(task); }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-muted"
        >
          <AppIcon glyph={Archive} size="sm" />
          Archivar
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => { setMenuOpen(false); onDelete(task); }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-pritio-coral hover:bg-pritio-coral/5"
        >
          <AppIcon glyph={Trash} size="sm" />
          Eliminar
        </button>
      )}
    </div>
  );

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
          {task.completed && <AppIcon glyph={Check} size="xs" />}
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
              <AppIcon glyph={Clock} size="sm" className="mr-1.5 inline-block text-pritio-purple" alt="Junta" />
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
        <div className="relative shrink-0 self-start">
          <button
            ref={btnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            aria-label="Acciones"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-soft transition-all hover:bg-surface-muted hover:text-ink md:opacity-0 md:group-hover:opacity-100"
          >
            <AppIcon glyph={DotsThreeVertical} weight="fill" />
          </button>
          {menuOpen && menuPosition && createPortal(menuContent, document.body)}
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
              <AppIcon glyph={CalendarBlank} size="xs" />
              Atrasada
            </span>
          ) : dueToday ? (
            <span
              title={dueLabel}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-600"
            >
              <AppIcon glyph={CalendarBlank} size="xs" />
              Hoy
            </span>
          ) : (
            <span title={dueLabel} className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted">
              <AppIcon glyph={CalendarBlank} size="sm" />
              {shortDate}
            </span>
          ))}

        {task.startAt && (
          <span
            title="Hora programada"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-pritio-blue"
          >
            <AppIcon glyph={Clock} size="sm" />
            {formatTime(new Date(task.startAt), timeFormat)}
          </span>
        )}

        {recurrenceLabel && (
          <span
            title="Recurrente"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted"
          >
            <AppIcon glyph={ArrowsClockwise} size="sm" />
            {recurrenceLabel}
          </span>
        )}

        {workspaceName && (
          <span className="inline-flex items-center rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
            {workspaceName}
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
            <AppIcon glyph={ListChecks} size="xs" />
            {task.subtaskCompleted ?? 0}/{task.subtaskTotal}
          </span>
        )}

        {task.kind === "meeting" && task.location && (
          <MetaIcon title={`Presencial · ${task.location}`} label={`Presencial · ${task.location}`} className="h-4 text-ink-muted">
            <AppIcon glyph={MapPin} size="sm" />
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
            <AppIcon glyph={Link} size="sm" />
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
            {task.approved ? (
              <AppIcon glyph={Check} size="sm" />
            ) : task.rejected ? (
              <AppIcon glyph={X} size="sm" />
            ) : (
              <AppIcon glyph={Clock} size="sm" />
            )}
          </MetaIcon>
        )}

        <span className="flex-1" />

        {responsableName && <AssigneeDot name={responsableName} />}
      </div>
    </div>
  );
}