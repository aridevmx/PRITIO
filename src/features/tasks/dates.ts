import type { Task } from "@/types";

/** Parse a date-only string (YYYY-MM-DD) as local midnight. Never UTC. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDate(dateStr: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? parseDateOnly(dateStr) : new Date(dateStr);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getDueText(dueDate: string): { label: string; variant: "overdue" | "today" | "future" | "none" } {
  const today = startOfToday();
  const due = parseDateOnly(dueDate);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return { label: abs === 1 ? "Vencida ayer" : `Vencida hace ${abs} días`, variant: "overdue" };
  }
  if (diffDays === 0) return { label: "Hoy", variant: "today" };
  if (diffDays === 1) return { label: "Mañana", variant: "future" };
  return { label: `En ${diffDays} días`, variant: "future" };
}

export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours < 24) return `hace ${hours}h`;
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return formatDate(dateStr);
}

export function groupTasksByWeek(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>();

  tasks
    .filter((t) => t.completedAt)
    .sort((a, b) => {
      const da = new Date(a.completedAt!);
      const db = new Date(b.completedAt!);
      return db.getTime() - da.getTime();
    })
    .forEach((task) => {
      const d = new Date(task.completedAt!);
      const weekStart = getWeekStart(d);
      const key = weekStart.toISOString().split("T")[0];
      const group = groups.get(key) ?? [];
      group.push(task);
      groups.set(key, group);
    });

  return groups;
}

export function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.completed) return false;
  return parseDateOnly(task.dueDate) < startOfToday();
}

export function isDueToday(task: Task): boolean {
  if (!task.dueDate) return false;
  const today = new Date();
  const due = parseDateOnly(task.dueDate);
  return (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  );
}

export function getWeekDays(date: Date): Date[] {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Convert a `datetime-local` value (no timezone) to ISO string for TIMESTAMPTZ columns */
export function localDatetimeToISO(value: string): string {
  if (!value) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toISOString();
}

export function groupTasksByDay(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>();
  const sorted = [...tasks].sort((a, b) => {
    const da = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const db = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return db - da;
  });

  sorted.forEach((task) => {
    if (!task.completedAt) return;
    const key = task.completedAt.split("T")[0];
    const group = groups.get(key) ?? [];
    group.push(task);
    groups.set(key, group);
  });

  return groups;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";

  const diffDays = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return `Hace ${diffDays} días`;

  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "long" });
}
