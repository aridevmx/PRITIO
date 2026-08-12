import type {
  Profile,
  ProfileRow,
  Workspace,
  WorkspaceRow,
  Subscription,
  SubscriptionRow,
  WorkspacePlan,
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
  AgendaEvent,
  AgendaEventRow,
} from "@/types";

// ─── Plan normalization ───────────────────────────────────
// workspaces.plan is legacy (was per-workspace). Billing now lives on
// account-level subscriptions; workspaces default to 'free'. Normalize any
// leftover legacy value so the UI never sees 'personal_free'/'enterprise'.

export function normalizePlan(plan: string | null | undefined): WorkspacePlan {
  switch (plan) {
    case "pro":
      return "pro";
    default:
      return "free";
  }
}

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
  "recurrence_freq",
  "recurrence_interval",
  "recurrence_end_date",
  "recurrence_count",
  "recurrence_parent_id",
  "approval_requested_at",
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
    plan: normalizePlan(row.plan),
    isFrozen: row.is_frozen,
    blockedDaysRequireApproval: row.blocked_days_require_approval,
    autoPromoteDueToDo: row.auto_promote_due_to_do,
    graceUntil: row.grace_until,
    createdAt: row.created_at,
  };
}

export function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    plan: "pro",
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    quantity: row.quantity,
    trialEndsAt: row.trial_ends_at,
    stripeSubscriptionId: row.stripe_subscription_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    recurrenceFreq: row.recurrence_freq,
    recurrenceInterval: row.recurrence_interval ?? 1,
    recurrenceEndDate: row.recurrence_end_date,
    recurrenceCount: row.recurrence_count,
    recurrenceParentId: row.recurrence_parent_id,
    approvalRequestedAt: row.approval_requested_at,
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
    delivery: row.delivery,
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

export function mapAgendaEvent(row: AgendaEventRow): AgendaEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    startsAt: row.starts_at,
    createdBy: row.created_by,
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
