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
import { AppIcon } from "@/components/AppIcon";
import { DotsSixVertical } from "@phosphor-icons/react";
import type { Task } from "@/types";

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function getDayIndex(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 0 ? 6 : day - 1;
}

function getDateForDay(dayIndex: number): string {
  const today = new Date();
  const monday = new Date(today);
  const currentDay = today.getDay();
  const diff = currentDay === 0 ? -6 : 1 - currentDay;
  monday.setDate(today.getDate() + diff + dayIndex);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function DraggableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: "none", opacity: isDragging ? 0.4 : 1 }}
      className="rounded-lg border border-line bg-surface-muted px-2 py-1.5 text-xs text-ink cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-ink-muted" aria-hidden="true">
          <AppIcon glyph={DotsSixVertical} size="xs" />
        </span>
        <p className="truncate font-medium flex-1">{task.title}</p>
      </div>
    </div>
  );
}

function DroppableDay({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] rounded-xl border border-line bg-surface p-2 transition-colors ${isOver ? "border-pritio-blue bg-pritio-blue/5" : ""}`}
    >
      {children}
    </div>
  );
}

interface PlanBoardProps {
  tasks: Task[];
  onTaskMove: (taskId: string, newDate: string) => void;
}

export function PlanBoard({ tasks, onTaskMove }: PlanBoardProps) {
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

    const targetDay = String(over.id);
    if (!targetDay.startsWith("day-")) return;

    const dayIndex = parseInt(targetDay.slice(4), 10);
    if (Number.isNaN(dayIndex)) return;

    const taskId = active.id as string;
    const newDate = getDateForDay(dayIndex);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentDue = task.dueDate || task.startDate;
    if (currentDue !== newDate) {
      onTaskMove(taskId, newDate);
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const tasksByDay = DAY_NAMES.map((_, idx) => {
    return tasks.filter((t) => {
      const due = t.dueDate || t.startDate;
      if (!due) return false;
      return getDayIndex(due) === idx;
    });
  });

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-7 gap-2">
        {DAY_NAMES.map((day, idx) => {
          const dayTasks = tasksByDay[idx];
          const dateStr = getDateForDay(idx);
          return (
            <DroppableDay key={day} id={`day-${idx}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-ink-muted">{day}</h3>
                <span className="text-[10px] text-ink-muted">{dateStr.slice(5)}</span>
              </div>
              <div className="space-y-1.5">
                {dayTasks.map((t) => (
                  <DraggableTaskCard key={t.id} task={t} />
                ))}
                {dayTasks.length === 0 && (
                  <p className="rounded-lg border border-dashed border-line px-1.5 py-3 text-center text-[10px] text-ink-muted">
                    Suelta aquí
                  </p>
                )}
              </div>
            </DroppableDay>
          );
        })}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="rounded-lg border border-line bg-surface-muted px-2 py-1.5 text-xs text-ink shadow-lg">
            <p className="truncate font-medium">{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
