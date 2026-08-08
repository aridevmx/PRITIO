import type { Quadrant, Task } from "@/types";

export type QuadrantIconKey = "zap" | "calendar" | "users" | "archive";

export interface QuadrantMeta {
  key: Quadrant;
  title: string;
  subtitle: string;
  iconKey: QuadrantIconKey;
  classes: {
    border: string;
    borderStrong: string;
    badge: string;
    accentBg: string;
    accentText: string;
    softBg: string;
    fromAccent: string;
    dropOver: string;
    glow: string;
  };
}

export const QUADRANTS: Record<Quadrant, QuadrantMeta> = {
  do: {
    key: "do",
    title: "Haz ahora",
    subtitle: "Importante y urgente",
    iconKey: "zap",
    classes: {
      border: "border-pritio-coral/30",
      borderStrong: "border-pritio-coral",
      badge: "bg-pritio-coral/10 text-pritio-coral",
      accentBg: "bg-pritio-coral",
      accentText: "text-pritio-coral",
      softBg: "bg-pritio-coral/5",
      fromAccent: "from-pritio-coral/30",
      dropOver: "ring-2 ring-pritio-coral/50 bg-pritio-coral/5",
      glow: "shadow-[0_0_0_1px_rgba(242,125,114,0.14),0_10px_32px_-10px_rgba(242,125,114,0.5)]",
    },
  },
  plan: {
    key: "plan",
    title: "Planifica",
    subtitle: "Importante pero no urge",
    iconKey: "calendar",
    classes: {
      border: "border-pritio-blue/30",
      borderStrong: "border-pritio-blue",
      badge: "bg-pritio-blue/10 text-pritio-blue",
      accentBg: "bg-pritio-blue",
      accentText: "text-pritio-blue",
      softBg: "bg-pritio-blue/5",
      fromAccent: "from-pritio-blue/30",
      dropOver: "ring-2 ring-pritio-blue/50 bg-pritio-blue/5",
      glow: "shadow-[0_0_0_1px_rgba(91,167,209,0.14),0_10px_32px_-10px_rgba(91,167,209,0.5)]",
    },
  },
  delegate: {
    key: "delegate",
    title: "Delega",
    subtitle: "No importante pero urgente",
    iconKey: "users",
    classes: {
      border: "border-pritio-green/30",
      borderStrong: "border-pritio-green",
      badge: "bg-pritio-green/10 text-pritio-green",
      accentBg: "bg-pritio-green",
      accentText: "text-pritio-green",
      softBg: "bg-pritio-green/5",
      fromAccent: "from-pritio-green/30",
      dropOver: "ring-2 ring-pritio-green/50 bg-pritio-green/5",
      glow: "shadow-[0_0_0_1px_rgba(79,195,138,0.14),0_10px_32px_-10px_rgba(79,195,138,0.5)]",
    },
  },
  later: {
    key: "later",
    title: "Después",
    subtitle: "No importante y no urgente",
    iconKey: "archive",
    classes: {
      border: "border-pritio-purple/30",
      borderStrong: "border-pritio-purple",
      badge: "bg-pritio-purple/10 text-pritio-purple",
      accentBg: "bg-pritio-purple",
      accentText: "text-pritio-purple",
      softBg: "bg-pritio-purple/5",
      fromAccent: "from-pritio-purple/30",
      dropOver: "ring-2 ring-pritio-purple/50 bg-pritio-purple/5",
      glow: "shadow-[0_0_0_1px_rgba(155,126,220,0.14),0_10px_32px_-10px_rgba(155,126,220,0.5)]",
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
