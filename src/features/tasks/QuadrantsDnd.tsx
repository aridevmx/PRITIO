import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { QUADRANTS } from "@/features/tasks/quadrants";
import { TaskCard } from "@/features/tasks/TaskCard";
import type { Task, Quadrant } from "@/types";

interface QuadrantsDndProps {
  children: React.ReactNode;
  tasks: Task[];
  onMoveTask: (taskId: string, newQuadrant: Quadrant) => void;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
}

export function QuadrantsDnd({
  children,
  tasks,
  onMoveTask,
  onToggleComplete,
  onEdit,
}: QuadrantsDndProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = event.active.id as string;
      const task = tasks.find((t) => t.id === taskId);
      if (task) setActiveTask(task);
    },
    [tasks],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const newQuadrant = over.id as Quadrant;

      if (!QUADRANTS[newQuadrant]) return;

      const task = tasks.find((t) => t.id === taskId);
      if (task && task.quadrant !== newQuadrant) {
        onMoveTask(taskId, newQuadrant);
      }
    },
    [tasks, onMoveTask],
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay>
        {activeTask && (
          <div className="w-72 opacity-90">
            <TaskCard
              task={activeTask}
              onToggleComplete={onToggleComplete}
              onEdit={onEdit}
              isDragging
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface QuadrantDropZoneProps {
  quadrantKey: Quadrant;
  children: React.ReactNode;
  isOver?: boolean;
}

export function QuadrantDropZone({
  quadrantKey,
  children,
  isOver,
}: QuadrantDropZoneProps) {
  const meta = QUADRANTS[quadrantKey];

  return (
    <div
      data-quadrant={quadrantKey}
      className={cn(
        "flex flex-col rounded-2xl border bg-surface p-4 shadow-soft transition-all",
        meta.classes.border,
        isOver && meta.classes.dropOver,
      )}
    >
      {children}
    </div>
  );
}
