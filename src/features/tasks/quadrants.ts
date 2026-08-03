import type { Quadrant, Task } from "@/types";

export interface QuadrantMeta {
  key: Quadrant;
  title: string;
  subtitle: string;
  classes: {
    border: string;
    borderStrong: string;
    badge: string;
    accentBg: string;
    accentText: string;
    softBg: string;
    fromAccent: string;
    dropOver: string;
  };
}

export const QUADRANTS: Record<Quadrant, QuadrantMeta> = {
  do: {
    key: "do",
    title: "Haz ahora",
    subtitle: "Importante y urgente",
    classes: {
      border: "border-prio-coral/30",
      borderStrong: "border-prio-coral",
      badge: "bg-prio-coral/10 text-prio-coral",
      accentBg: "bg-prio-coral",
      accentText: "text-prio-coral",
      softBg: "bg-prio-coral/5",
      fromAccent: "from-prio-coral/30",
      dropOver: "ring-2 ring-prio-coral/50 bg-prio-coral/5",
    },
  },
  plan: {
    key: "plan",
    title: "Planifica",
    subtitle: "Importante pero no urge",
    classes: {
      border: "border-prio-blue/30",
      borderStrong: "border-prio-blue",
      badge: "bg-prio-blue/10 text-prio-blue",
      accentBg: "bg-prio-blue",
      accentText: "text-prio-blue",
      softBg: "bg-prio-blue/5",
      fromAccent: "from-prio-blue/30",
      dropOver: "ring-2 ring-prio-blue/50 bg-prio-blue/5",
    },
  },
  delegate: {
    key: "delegate",
    title: "Delega",
    subtitle: "No importante pero urgente",
    classes: {
      border: "border-prio-green/30",
      borderStrong: "border-prio-green",
      badge: "bg-prio-green/10 text-prio-green",
      accentBg: "bg-prio-green",
      accentText: "text-prio-green",
      softBg: "bg-prio-green/5",
      fromAccent: "from-prio-green/30",
      dropOver: "ring-2 ring-prio-green/50 bg-prio-green/5",
    },
  },
  later: {
    key: "later",
    title: "Después",
    subtitle: "No importante y no urgente",
    classes: {
      border: "border-prio-purple/30",
      borderStrong: "border-prio-purple",
      badge: "bg-prio-purple/10 text-prio-purple",
      accentBg: "bg-prio-purple",
      accentText: "text-prio-purple",
      softBg: "bg-prio-purple/5",
      fromAccent: "from-prio-purple/30",
      dropOver: "ring-2 ring-prio-purple/50 bg-prio-purple/5",
    },
  },
};

export const QUADRANT_ORDER: Quadrant[] = ["do", "plan", "delegate", "later"];

export function taskHasAssignee(task: Task, assigneeId: string): boolean {
  return task.assigneeIds.includes(assigneeId);
}

export function taskBelongsToUser(task: Task, userId: string): boolean {
  return task.createdBy === userId;
}

export function taskBelongsToMeFilter(
  task: Task,
  myAssigneeIds: string[],
): boolean {
  return task.assigneeIds.some((id) => myAssigneeIds.includes(id));
}

export function taskMatchesAssigneeFilter(
  task: Task,
  filterAssigneeIds: string[],
): boolean {
  if (filterAssigneeIds.length === 0) return true;
  return task.assigneeIds.some((id) => filterAssigneeIds.includes(id));
}

export function getAssigneeNamesLabel(
  assigneeIds: string[],
  assigneesById: Map<string, { name: string }>,
): string {
  if (assigneeIds.length === 0) return "";
  const names = assigneeIds
    .map((id) => assigneesById.get(id)?.name)
    .filter(Boolean) as string[];
  if (names.length === 0) return "";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}
