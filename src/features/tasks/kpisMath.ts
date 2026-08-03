import type { Task, Quadrant } from "@/types";
import { isOverdue } from "./dates";

export function countByQuadrant(tasks: Task[]): Record<Quadrant, number> {
  const counts: Record<Quadrant, number> = { do: 0, plan: 0, delegate: 0, later: 0 };
  tasks.forEach((t) => {
    if (!t.completed) {
      counts[t.quadrant]++;
    }
  });
  return counts;
}

export function countByAssignee(tasks: Task[]): Map<string, number> {
  const counts = new Map<string, number>();
  tasks.forEach((t) => {
    if (!t.completed) {
      t.assigneeIds.forEach((id) => {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      });
    }
  });
  return counts;
}

export function countByProject(tasks: Task[]): Map<string, number> {
  const counts = new Map<string, number>();
  tasks.forEach((t) => {
    if (!t.completed && t.projectId) {
      counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
    }
  });
  return counts;
}

export function countCompletedThisWeek(tasks: Task[]): number {
  const now = new Date();
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - day + (day === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  return tasks.filter(
    (t) =>
      t.completed &&
      t.completedAt &&
      new Date(t.completedAt) >= weekStart,
  ).length;
}

export function countOverdue(tasks: Task[]): number {
  return tasks.filter((t) => isOverdue(t)).length;
}
