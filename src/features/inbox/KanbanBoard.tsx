import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/AppIcon";
import { DotsSixVertical } from "@phosphor-icons/react";
import type { Task, Quadrant } from "@/types";
import { QUADRANTS, QUADRANT_ORDER } from "@/features/tasks/quadrants";

interface DraggableTaskCardProps {
  task: Task;
  onEdit?: (task: Task) => void;
}

function DraggableTaskCard({ task, onEdit }: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none", opacity: isDragging ? 0.4 : 1 }}
      className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-ink cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <span className="text-ink-muted" aria-hidden="true">
          <AppIcon glyph={DotsSixVertical} size="xs" />
        </span>
        <p
          className="truncate font-medium flex-1 cursor-pointer hover:text-pritio-blue"
          onClick={() => onEdit?.(task)}
        >
          {task.title}
        </p>
      </div>
      {task.dueDate && (
        <p className="text-[10px] text-ink-muted mt-1 ml-6">{task.dueDate}</p>
      )}
    </div>
  );
}

interface KanbanBoardProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newQuadrant: Quadrant) => void;
  onTaskEdit?: (task: Task) => void;
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[300px] rounded-xl border border-line bg-surface p-3 transition-colors",
        isOver && "border-pritio-blue bg-pritio-blue/5",
      )}
    >
      {children}
    </div>
  );
}

export function KanbanBoard({ tasks, onTaskMove, onTaskEdit }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const taskId = active.id as string;
    const newQuadrant = over.id as Quadrant;

    if (!QUADRANT_ORDER.includes(newQuadrant)) return;

    const task = tasks.find((t) => t.id === taskId);
    if (task && task.quadrant !== newQuadrant) {
      onTaskMove(taskId, newQuadrant);
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-4 gap-3">
        {QUADRANT_ORDER.map((q) => {
          const qTasks = tasks.filter((t) => t.quadrant === q);
          const meta = QUADRANTS[q];
          return (
            <DroppableColumn key={q} id={q}>
              <div className="flex items-center gap-2 mb-3">
                <span className={cn("h-2.5 w-2.5 rounded-full", meta?.classes.accentBg)} />
                <h3 className="text-sm font-bold text-ink">{meta?.title}</h3>
                <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                  {qTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {qTasks.map((t) => (
                  <DraggableTaskCard key={t.id} task={t} onEdit={onTaskEdit} />
                ))}
                {qTasks.length === 0 && (
                  <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[11px] text-ink-muted">
                    Suelta una tarea aquí
                  </p>
                )}
              </div>
            </DroppableColumn>
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-ink shadow-lg">
            <p className="truncate font-medium">{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
