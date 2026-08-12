import type {
  PlanFeature,
  PlanLimits,
  PlanResource,
  WorkspacePlan,
  WorkspaceType,
} from "@/types";

/**
 * Client-side copy of the `plan_limits` table (see supabase/migrations/0025).
 * The server enforces quotas via triggers reading the DB table; this module
 * powers the UX (progress, disabled actions, feature flags, upsell prompts).
 *
 * Model: 1 workspace of each type (personal base + family + team). Free limits
 * scale with the workspace type; Pro lifts them all.
 */

const ROW = (
  plan: WorkspacePlan,
  workspaceType: WorkspaceType,
  memberLimit: number,
  activeTaskLimit: number,
  projectLimit: number,
  assigneeLimit: number,
  blockedDayLimit: number,
  workspaceLimit: number,
  agendaEventLimit: number,
  allowPlanView: boolean,
  allowBoardView: boolean,
  allowMeetings: boolean,
  allowDueDate: boolean,
  supportTier: string,
): PlanLimits => ({
  plan,
  workspaceType,
  memberLimit,
  activeTaskLimit,
  projectLimit,
  assigneeLimit,
  blockedDayLimit,
  workspaceLimit,
  agendaEventLimit,
  allowPlanView,
  allowBoardView,
  allowMeetings,
  allowDueDate,
  supportTier,
});

export const PLAN_LIMITS: PlanLimits[] = [
  ROW("free", "personal", 1, 50, 3, 0, 10, 1, 0, false, false, false, false, "mail"),
  ROW("pro", "personal", 1, 300, 100, 0, 30, 1, 0, true, true, true, true, "mail+chat"),
  ROW("free", "family", 4, 50, 5, 5, 10, 1, 10, false, false, false, false, "mail"),
  ROW("pro", "family", 10, 300, 100, 50, 30, 1, 100, true, true, true, true, "email+chat"),
  ROW("free", "team", 5, 100, 5, 10, 10, 1, 0, false, false, false, false, "mail"),
  ROW("pro", "team", 50, 5000, 500, 500, 90, 1, 0, true, true, true, true, "chat+mail+phone"),
];

export function getLimits(plan: WorkspacePlan, workspaceType: WorkspaceType): PlanLimits {
  return (
    PLAN_LIMITS.find((l) => l.plan === plan && l.workspaceType === workspaceType) ??
    PLAN_LIMITS[0]
  );
}

export interface UsageSnapshot {
  members: number;
  activeTasks: number;
  projects: number;
  assignees: number;
  blockedDays: number;
  agendaEvents: number;
  workspaces: number;
}

const RESOURCE_LIMIT_KEY: Partial<
  Record<
    PlanResource,
    "memberLimit" | "activeTaskLimit" | "projectLimit" | "assigneeLimit" | "blockedDayLimit" | "workspaceLimit" | "agendaEventLimit"
  >
> = {
  members: "memberLimit",
  active_tasks: "activeTaskLimit",
  projects: "projectLimit",
  assignees: "assigneeLimit",
  blocked_days: "blockedDayLimit",
  agenda_events: "agendaEventLimit",
  workspaces: "workspaceLimit",
};

const RESOURCE_USAGE_KEY: Partial<Record<PlanResource, keyof UsageSnapshot>> = {
  members: "members",
  active_tasks: "activeTasks",
  projects: "projects",
  assignees: "assignees",
  blocked_days: "blockedDays",
  agenda_events: "agendaEvents",
  workspaces: "workspaces",
};

export const PLAN_RESOURCE_LABELS: Record<PlanResource, string> = {
  members: "Miembros",
  active_tasks: "Tareas activas",
  projects: "Proyectos",
  assignees: "Responsables",
  blocked_days: "Días bloqueados",
  agenda_events: "Eventos de agenda",
  workspaces: "Workspaces",
  meetings: "Juntas",
};

/** True when the current usage already reached the plan limit (block next insert). */
export function isAtLimit(
  limits: PlanLimits,
  usage: UsageSnapshot,
  resource: PlanResource,
): boolean {
  if (resource === "meetings") {
    return !limits.allowMeetings;
  }
  const limitKey = RESOURCE_LIMIT_KEY[resource];
  const usageKey = RESOURCE_USAGE_KEY[resource];
  if (!limitKey || !usageKey) return false;
  return usage[usageKey] >= limits[limitKey];
}

export function limitFor(limits: PlanLimits, resource: PlanResource): number {
  if (resource === "meetings") {
    return limits.allowMeetings ? Number.POSITIVE_INFINITY : 0;
  }
  const key = RESOURCE_LIMIT_KEY[resource];
  return key ? limits[key] : 0;
}

export function usageFor(usage: UsageSnapshot, resource: PlanResource): number {
  if (resource === "meetings") {
    return 0;
  }
  const key = RESOURCE_USAGE_KEY[resource];
  return key ? usage[key] : 0;
}

/** Feature flags from plan_limits (views, meetings, due date, agenda). */
export function hasFeature(limits: PlanLimits, feature: PlanFeature): boolean {
  switch (feature) {
    case "plan_view":
      return limits.allowPlanView;
    case "board_view":
      return limits.allowBoardView;
    case "meetings":
      return limits.allowMeetings;
    case "due_date":
      return limits.allowDueDate;
    case "agenda_events":
      return limits.agendaEventLimit > 0;
  }
}

/** Human-friendly value, e.g. "10", "1,000", "25,000". */
export function formatLimit(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}
