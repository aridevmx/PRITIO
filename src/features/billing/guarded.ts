import type { PlanResource } from "@/types";

const PLAN_LIMIT_PATTERN = /prio_plan_limit:([a-z_]+)/i;

/**
 * Extract the resource that tripped a plan-limit server trigger from an error
 * (RAISE EXCEPTION 'prio_plan_limit:<resource>' in migration 0021). Returns
 * null when the error is not a quota error, so callers can fall back to the
 * generic error handling.
 */
export function parsePlanLimitError(err: unknown): PlanResource | null {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const match = msg.match(PLAN_LIMIT_PATTERN);
  if (!match) return null;
  const resource = match[1] as PlanResource;
  const valid: PlanResource[] = [
    "members",
    "active_tasks",
    "projects",
    "assignees",
    "blocked_days",
    "workspaces",
    "meetings",
    "events",
  ];
  return valid.includes(resource) ? resource : null;
}
