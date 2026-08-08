import type {
  PlanLimits,
  PlanResource,
  WorkspacePlan,
  WorkspaceType,
} from "@/types";

/**
 * Client-side copy of the `plan_limits` table (see supabase/migrations/0021).
 * The server enforces quotas via triggers reading the DB table; this module
 * powers the UX (progress, disabled actions, upsell prompts).
 *
 * Free limits scale with the workspace type; Pro/Lifetime lift them all to a
 * shared, data-bounded ceiling (hosted on the Supabase free tier → 500 MB DB).
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
): PlanLimits => ({
  plan,
  workspaceType,
  memberLimit,
  activeTaskLimit,
  projectLimit,
  assigneeLimit,
  blockedDayLimit,
  workspaceLimit,
});

export const PLAN_LIMITS: PlanLimits[] = [
  ROW("free", "personal", 1, 100, 3, 3, 10, 3),
  ROW("free", "family", 5, 500, 10, 10, 30, 3),
  ROW("free", "team", 10, 1000, 20, 20, 30, 3),
  ROW("free", "enterprise", 10, 1000, 20, 20, 30, 3),
  ROW("pro", "personal", 1, 2500, 300, 200, 500, 10),
  ROW("pro", "family", 10, 50000, 100, 100, 500, 3),
  ROW("pro", "team", 50, 100000, 500, 500, 1000, 10),
  ROW("pro", "enterprise", 50, 100000, 500, 500, 1000, 10),
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
  workspaces: number;
}

const RESOURCE_LIMIT_KEY: Record<
  PlanResource,
  "memberLimit" | "activeTaskLimit" | "projectLimit" | "assigneeLimit" | "blockedDayLimit" | "workspaceLimit"
> = {
  members: "memberLimit",
  active_tasks: "activeTaskLimit",
  projects: "projectLimit",
  assignees: "assigneeLimit",
  blocked_days: "blockedDayLimit",
  workspaces: "workspaceLimit",
};

const RESOURCE_USAGE_KEY: Record<PlanResource, keyof UsageSnapshot> = {
  members: "members",
  active_tasks: "activeTasks",
  projects: "projects",
  assignees: "assignees",
  blocked_days: "blockedDays",
  workspaces: "workspaces",
};

export const PLAN_RESOURCE_LABELS: Record<PlanResource, string> = {
  members: "Miembros",
  active_tasks: "Tareas activas",
  projects: "Proyectos",
  assignees: "Responsables",
  blocked_days: "Días bloqueados",
  workspaces: "Workspaces",
};

/** True when the current usage already reached the plan limit (block next insert). */
export function isAtLimit(
  limits: PlanLimits,
  usage: UsageSnapshot,
  resource: PlanResource,
): boolean {
  return usage[RESOURCE_USAGE_KEY[resource]] >= limits[RESOURCE_LIMIT_KEY[resource]];
}

export function limitFor(limits: PlanLimits, resource: PlanResource): number {
  return limits[RESOURCE_LIMIT_KEY[resource]];
}

export function usageFor(usage: UsageSnapshot, resource: PlanResource): number {
  return usage[RESOURCE_USAGE_KEY[resource]];
}

/** Human-friendly value, e.g. "10", "1,000", "25,000". */
export function formatLimit(value: number): string {
  return new Intl.NumberFormat("es-MX").format(value);
}
