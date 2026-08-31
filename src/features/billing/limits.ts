import type {
  PlanFeature,
  PlanLimits,
  PlanResource,
  WorkspacePlan,
  WorkspaceType,
} from "@/types";

/**
 * Client-side copy of the `plan_limits` table (see supabase/migrations/0025
 * and 0027). The server enforces quotas via triggers reading the DB table;
 * this module powers the UX (progress, disabled actions, feature flags,
 * upsell prompts).
 *
 * Model: 1 workspace of each type (personal base + family + team). Free limits
 * scale with the workspace type; Pro lifts them all.
 *
 * Monthly quotas: meetings_per_month / events_per_month (NULL = ilimitado).
 * free: personal 5 juntas + 5 eventos, team 5 juntas, family 5 eventos.
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
  meetingsPerMonth: number | null,
  eventsPerMonth: number | null,
  allowPlanView: boolean,
  allowBoardView: boolean,
  allowDueDate: boolean,
  allowPremiumThemes: boolean,
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
  meetingsPerMonth,
  eventsPerMonth,
  allowPlanView,
  allowBoardView,
  allowDueDate,
  allowPremiumThemes,
  supportTier,
});

export const PLAN_LIMITS: PlanLimits[] = [
  ROW("free", "personal", 1, 50, 3, 0, 10, 1, 5, 5, false, false, false, false, "mail"),
  ROW("pro", "personal", 1, 300, 100, 0, 30, 1, null, null, true, true, true, true, "mail+chat"),
  ROW("free", "family", 4, 50, 5, 5, 10, 1, 0, 5, false, false, false, false, "mail"),
  ROW("pro", "family", 10, 300, 100, 50, 30, 1, null, null, true, true, true, true, "email+chat"),
  ROW("free", "team", 5, 100, 5, 10, 10, 1, 5, 0, false, false, false, false, "mail"),
  ROW("pro", "team", 50, 5000, 500, 500, 90, 1, null, null, true, true, true, true, "chat+mail+phone"),
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
  meetingsThisMonth: number;
  eventsThisMonth: number;
  workspaces: number;
}

const RESOURCE_LIMIT_KEY: Partial<
  Record<
    PlanResource,
    | "memberLimit"
    | "activeTaskLimit"
    | "projectLimit"
    | "assigneeLimit"
    | "blockedDayLimit"
    | "workspaceLimit"
    | "meetingsPerMonth"
    | "eventsPerMonth"
  >
> = {
  members: "memberLimit",
  active_tasks: "activeTaskLimit",
  projects: "projectLimit",
  assignees: "assigneeLimit",
  blocked_days: "blockedDayLimit",
  meetings: "meetingsPerMonth",
  events: "eventsPerMonth",
  workspaces: "workspaceLimit",
};

const RESOURCE_USAGE_KEY: Partial<Record<PlanResource, keyof UsageSnapshot>> = {
  members: "members",
  active_tasks: "activeTasks",
  projects: "projects",
  assignees: "assignees",
  blocked_days: "blockedDays",
  meetings: "meetingsThisMonth",
  events: "eventsThisMonth",
  workspaces: "workspaces",
};

export const PLAN_RESOURCE_LABELS: Record<PlanResource, string> = {
  members: "Miembros",
  active_tasks: "Tareas activas",
  projects: "Proyectos",
  assignees: "Responsables",
  blocked_days: "Días bloqueados",
  meetings: "Juntas",
  events: "Eventos",
  workspaces: "Workspaces",
};

/** True when the current usage already reached the plan limit (block next insert). */
export function isAtLimit(
  limits: PlanLimits,
  usage: UsageSnapshot,
  resource: PlanResource,
): boolean {
  const limitKey = RESOURCE_LIMIT_KEY[resource];
  const usageKey = RESOURCE_USAGE_KEY[resource];
  if (!limitKey || !usageKey) return false;
  const limit = limits[limitKey];
  if (limit === null) return false;
  return usage[usageKey] >= limit;
}

/** Number limit for a resource; Infinity when unlimited. */
export function limitFor(limits: PlanLimits, resource: PlanResource): number {
  const key = RESOURCE_LIMIT_KEY[resource];
  const limit = key ? limits[key] : 0;
  return limit === null ? Number.POSITIVE_INFINITY : limit;
}

export function usageFor(usage: UsageSnapshot, resource: PlanResource): number {
  const key = RESOURCE_USAGE_KEY[resource];
  return key ? usage[key] : 0;
}

/** Feature flags from plan_limits (views, meetings, events, due date). */
export function hasFeature(limits: PlanLimits, feature: PlanFeature): boolean {
  switch (feature) {
    case "plan_view":
      return limits.allowPlanView;
    case "board_view":
      return limits.allowBoardView;
    case "meetings":
      return limits.meetingsPerMonth !== 0;
    case "events":
      return limits.eventsPerMonth !== 0;
    case "due_date":
      return limits.allowDueDate;
    case "premium_themes":
      return limits.allowPremiumThemes;
  }
}

/** Human-friendly value, e.g. "10", "1,000", "Ilimitadas". */
export function formatLimit(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}
