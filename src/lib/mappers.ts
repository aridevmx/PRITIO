import type {
  Profile,
  ProfileRow,
  Workspace,
  WorkspaceRow,
  Task,
  TaskRow,
  Assignee,
  AssigneeRow,
  Notification,
  NotificationRow,
  Project,
  ProjectRow,
  Invitation,
  InvitationRow,
  UserBlockedDay,
} from "@/types";

// ─── Task columns for select queries ──────────────────────

export const TASK_COLUMNS = [
  "id",
  "workspace_id",
  "project_id",
  "title",
  "description",
  "quadrant",
  "kind",
  "due_date",
  "start_at",
  "end_at",
  "location",
  "meeting_link",
  "completed",
  "completed_at",
  "requires_approval",
  "approved",
  "rejected",
  "rejection_reason",
  "responsible_assignee_id",
  "is_active",
  "block_override_id",
  "grace_started_at",
  "submit_finalized_at",
  "created_by",
  "created_at",
  "updated_at",
].join(", ");

// ─── Mappers ──────────────────────────────────────────────

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isFrozen: row.is_frozen,
    blockedDaysRequireApproval: row.blocked_days_require_approval,
    autoPromoteDueToDo: row.auto_promote_due_to_do,
    createdAt: row.created_at,
  };
}

export function mapTask(row: TaskRow, assigneeIds: string[]): Task {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    quadrant: row.quadrant,
    kind: row.kind,
    dueDate: row.due_date,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location,
    meetingLink: row.meeting_link,
    completed: row.completed,
    completedAt: row.completed_at,
    requiresApproval: row.requires_approval,
    approved: row.approved,
    rejected: row.rejected,
    rejectionReason: row.rejection_reason,
    responsibleAssigneeId: row.responsible_assignee_id,
    assigneeIds,
    isActive: row.is_active,
    blockOverrideId: row.block_override_id,
    graceStartedAt: row.grace_started_at,
    submitFinalizedAt: row.submit_finalized_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAssignee(row: AssigneeRow, linkedUserIds: string[] = []): Assignee {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    linkedUserId: row.linked_user_id,
    linkedUserIds: row.linked_user_id
      ? [row.linked_user_id, ...linkedUserIds.filter((id) => id !== row.linked_user_id)]
      : linkedUserIds,
    isLead: false,
    createdAt: row.created_at,
  };
}

export function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    read: row.read,
    createdAt: row.created_at,
  };
}

export function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

export function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

export function mapBlockedDay(row: Record<string, unknown>): UserBlockedDay {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    workspaceId: row.workspace_id as string,
    blockedDate: row.blocked_date as string,
    startTime: row.start_time as string | null,
    endTime: row.end_time as string | null,
    reason: row.reason as string | null,
    status: row.status as UserBlockedDay["status"],
    decidedBy: row.decided_by as string | null,
    decidedAt: row.decided_at as string | null,
    rejectionReason: row.rejection_reason as string | null,
    createdAt: row.created_at as string,
  };
}

// ─── Case conversion utilities ────────────────────────────

export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

export function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}
