import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Check,
  Clock,
  GripVertical,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
  Video,
} from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import type { Assignee, Profile, Quadrant, Task } from "@/types";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";
import {
  formatMeetingTimeRange,
  formatRelativeFromTimestamp,
  getDueLabel,
  getDueTone,
} from "@/features/tasks/dates";
import { useTaskHighlight } from "@/features/tasks/TaskNavigationProvider";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
  /**
   * Lista de responsables de la tarea, en orden (primary primero).
   * El componente los muestra como "Juan · María · Pedro" en una
   * sola linea truncada. Si esta vacio, no se renderiza nada.
   */
  assignees: Assignee[];
  projectName: string | null;
  /** Perfil del creador (si lo conocemos en este workspace). */
  creator?: Profile | null;
  /** Cuando true, muestra la línea "Creada por X · hace Y". */
  showCreator?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
  /**
   * Si false, el menu "..." oculta el boton Editar. Combinado con
   * canDelete=false, el menu directamente no se muestra. Calculado
   * por el caller: editar lo permite el creador o un manager.
   */
  canEdit?: boolean;
  /**
   * Si false, el menu "..." oculta el boton Eliminar. Calculado
   * por el caller: borrar lo permite el creador o un manager
   * (owner/admin) del workspace.
   */
  canDelete?: boolean;
  /** When true, this card is not the one being dragged (just the ghost). */
  draggable?: boolean;
  /**
   * Si se pasa, el menu "..." muestra una seccion "Mover a..." con
   * los cuadrantes alternativos. Util para mobile donde el drag
   * entre cuadrantes esta deshabilitado (vista 2x2 con foco). El
   * caller decide si moverla optimisticamente o esperar al server.
   */
  onMoveQuadrant?: (target: Quadrant) => void;
}

export function TaskCard({
  task,
  assignees,
  projectName,
  creator,
  showCreator = false,
  onEdit,
  onDelete,
  onToggleComplete,
  canEdit = true,
  canDelete = true,
  draggable = true,
  onMoveQuadrant,
}: TaskCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDone = task.completed;
  // Si ni editar ni borrar ni mover estan permitidos, no mostramos
  // el boton "..." que abre el menu. canMove requiere que la tarea
  // no este completada ni rechazada (mover una rechazada al cuadrante
  // X no tiene sentido — primero hay que resubmit).
  const canMove = !!onMoveQuadrant && !isDone && !task.rejected;
  const hasMenuActions = canEdit || canDelete || canMove;
  const { isHighlighted, ref: highlightRef, onInteract } = useTaskHighlight(
    task.id,
  );
  const cardRef = useRef<HTMLDivElement | null>(null);

  // dnd-kit hook. We attach listeners only to the grip handle so the
  // rest of the card (checkbox, body click, menu) stays interactive.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { taskId: task.id, fromQuadrant: task.quadrant },
    disabled: !draggable || isDone,
  });

  // Combinar el ref de dnd-kit con el ref de highlight (para scroll-into-view)
  function setRefs(node: HTMLDivElement | null) {
    cardRef.current = node;
    setNodeRef(node);
    highlightRef(node);
  }

  // Cuando se hace cualquier click sobre la tarjeta, limpiar el
  // highlight para que no siga distrayendo.
  useEffect(() => {
    if (!isHighlighted) return;
    const node = cardRef.current;
    if (!node) return;
    function clear() {
      onInteract();
    }
    node.addEventListener("click", clear, { once: true });
    return () => node.removeEventListener("click", clear);
  }, [isHighlighted, onInteract]);

  return (
    <div
      ref={setRefs}
      className={cn(
        "group relative rounded-xl border bg-white px-3.5 py-3 transition-all",
        "hover:shadow-soft",
        isDone ? "border-line/60 opacity-60" : "border-line",
        isDragging && "opacity-30",
        isHighlighted && "task-highlight",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle: oculto en mobile (la vista focused no permite
            mover entre cuadrantes con drag, el usuario cambia desde el
            picker del form). En desktop se mantiene como antes: hover
            para descubrirlo, drag para mover entre cuadrantes. */}
        {draggable && !isDone && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar para mover de cuadrante"
            className={cn(
              "-ml-1 mt-0.5 hidden h-5 w-4 shrink-0 cursor-grab touch-none place-items-center text-ink-muted opacity-0 transition-opacity hover:text-ink active:cursor-grabbing md:grid md:group-hover:opacity-100",
            )}
          >
            <GripVertical size={14} />
          </button>
        )}

        {/* Complete checkbox - bloqueado si la tarea esta rechazada
            (debe corregirse o borrarse, no completarse) o esperando
            aprobacion (no se puede completar sin que un manager la
            apruebe primero). */}
        <button
          type="button"
          onClick={onToggleComplete}
          disabled={
            task.rejected ||
            (task.requiresApproval && !task.approved && !isDone)
          }
          aria-label={
            task.rejected
              ? "No puedes completar una tarea rechazada"
              : task.requiresApproval && !task.approved && !isDone
                ? "No puedes completar una tarea sin aprobacion"
                : isDone
                  ? "Marcar pendiente"
                  : "Marcar completada"
          }
          title={
            task.rejected
              ? "Esta tarea fue rechazada. Editala o borrala."
              : task.requiresApproval && !task.approved && !isDone
                ? "Esta tarea esta esperando aprobacion."
                : undefined
          }
          className={cn(
            // Mobile: 32px visual = tap target comodo. Desktop: 20px.
            "grid h-8 w-8 md:mt-0.5 md:h-5 md:w-5 shrink-0 place-items-center rounded-full border transition-all",
            isDone
              ? "border-prio-green bg-prio-green text-white"
              : task.rejected
                ? "cursor-not-allowed border-red-200 bg-red-50/50"
                : task.requiresApproval && !task.approved
                  ? "cursor-not-allowed border-amber-200 bg-amber-50/50"
                  : "border-line hover:border-prio-green",
          )}
        >
          {isDone && <Check className="h-4 w-4 md:h-3 md:w-3" strokeWidth={3} />}
        </button>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onEdit}
            className="block w-full text-left"
          >
            <div
              className={cn(
                "text-sm font-medium leading-snug text-ink",
                isDone && "line-through",
              )}
            >
              {task.kind === "meeting" && (
                <Video
                  size={12}
                  className="mr-1 inline-block align-text-bottom text-prio-blue"
                  aria-label="Junta"
                />
              )}
              {task.title}
            </div>

            {/* Preview de descripcion: 2 lineas truncadas. Crece la
                tarjeta solo lo necesario para evitar scroll tedioso
                cuando el body es largo. Click sobre la tarea sigue
                abriendo el dialog completo. */}
            {task.description && task.description.trim().length > 0 && (
              <p
                className={cn(
                  "mt-1 line-clamp-2 whitespace-pre-wrap text-[12px] leading-snug text-ink-soft",
                  isDone && "line-through",
                )}
              >
                {task.description}
              </p>
            )}

            {(projectName || assignees.length > 0) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                {projectName && (
                  <span className="truncate text-ink-soft">
                    {projectName}
                  </span>
                )}
                {projectName && assignees.length > 0 && (
                  <span className="text-ink-muted">·</span>
                )}
                {assignees.map((a, idx) => (
                  <span
                    key={a.id}
                    title={
                      idx === 0
                        ? `Responsable principal: ${a.name}`
                        : a.name
                    }
                    className={cn(
                      "inline-flex max-w-[140px] items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                      idx === 0
                        ? "bg-prio-blue/10 text-prio-blue"
                        : "bg-surface-muted text-ink",
                    )}
                  >
                    {idx === 0 && (
                      <span className="text-[8px]" aria-hidden="true">
                        ★
                      </span>
                    )}
                    <span className="truncate">{a.name}</span>
                  </span>
                ))}
              </div>
            )}

            {showCreator && (creator || task.createdAt) && (
              <div className="mt-1 truncate text-[10px] text-ink-muted">
                {creator
                  ? `Creada por ${creator.fullName || creator.email.split("@")[0]}`
                  : "Creada"}
                {task.createdAt && (
                  <> · {formatRelativeFromTimestamp(task.createdAt)}</>
                )}
              </div>
            )}
          </button>

          {(task.dueDate || task.requiresApproval || task.startAt) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {task.kind === "meeting" && task.startAt ? (
                // Para juntas mostramos el rango horario (con date label
                // si la fecha es != hoy) en lugar del "Para mañana" suelto.
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    getDueTone(task.dueDate),
                  )}
                >
                  <Clock size={10} />
                  {formatMeetingTimeRange(task.startAt, task.endAt)}
                  {task.dueDate && (
                    <span className="opacity-70">
                      · {getDueLabel(task.dueDate)}
                    </span>
                  )}
                </span>
              ) : (
                task.dueDate && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      getDueTone(task.dueDate),
                    )}
                  >
                    <Calendar size={10} />
                    {getDueLabel(task.dueDate)}
                  </span>
                )
              )}
              {task.kind === "meeting" && task.location && (
                <span
                  className="inline-flex items-center gap-1 truncate rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-ink-soft max-w-[140px]"
                  title={task.location}
                >
                  <MapPin size={10} />
                  <span className="truncate">{task.location}</span>
                </span>
              )}
              {task.kind === "meeting" && task.meetingLink && (
                <a
                  href={task.meetingLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 rounded-full bg-prio-blue/10 px-2 py-0.5 text-[10px] font-semibold text-prio-blue hover:bg-prio-blue/15"
                >
                  <Video size={10} />
                  Unirse
                </a>
              )}
              {task.requiresApproval && !task.approved && !task.rejected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-100">
                  Por aprobar
                </span>
              )}
              {task.rejected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-100">
                  Rechazada
                </span>
              )}
            </div>
          )}

          {/* Caja con motivo de rechazo. Visible para autor y para
              cualquier miembro que vea la tarea. */}
          {task.rejected && task.rejectionReason && (
            <div className="mt-2 rounded-lg border border-red-100 bg-red-50/60 px-2.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-red-800">
                Motivo del rechazo
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-snug text-red-900">
                {task.rejectionReason}
              </p>
            </div>
          )}
        </div>

        {/* Actions menu — solo si hay al menos una accion permitida */}
        {hasMenuActions && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => {
                setTimeout(() => setMenuOpen(false), 120);
              }}
              aria-label="Acciones"
              className="grid h-9 w-9 md:h-7 md:w-7 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-line bg-white p-1 shadow-elevated">
                {canEdit && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setMenuOpen(false);
                      onEdit();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-ink hover:bg-surface-muted"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={12} />
                    Eliminar
                  </button>
                )}
                {canMove && (
                  <>
                    {(canEdit || canDelete) && (
                      <div className="my-1 border-t border-line/60" />
                    )}
                    <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      Mover a
                    </div>
                    {QUADRANT_ORDER.filter((q) => q !== task.quadrant).map(
                      (qk) => {
                        const meta = QUADRANTS[qk];
                        return (
                          <button
                            key={qk}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setMenuOpen(false);
                              onMoveQuadrant?.(qk);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-ink hover:bg-surface-muted"
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                meta.classes.accentBg,
                              )}
                            />
                            <span className="flex-1 truncate">{meta.title}</span>
                            <ArrowRight
                              size={11}
                              className="text-ink-muted"
                            />
                          </button>
                        );
                      },
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
