import type { WorkspaceRole, WorkspaceType } from "@/types";

const RANKS: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  leader: 2,
  member: 1,
};

const FAMILY_RANKS: Record<WorkspaceRole, number> = {
  owner: 3,
  admin: 3,
  leader: 2,
  member: 1,
};

export function roleRankFor(
  role: WorkspaceRole,
  workspaceType: WorkspaceType,
): number {
  if (workspaceType === "family") {
    return FAMILY_RANKS[role];
  }
  return RANKS[role];
}

export function canManageRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
  workspaceType: WorkspaceType,
): boolean {
  return roleRankFor(actorRole, workspaceType) > roleRankFor(targetRole, workspaceType);
}
