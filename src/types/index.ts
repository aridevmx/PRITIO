export type Quadrant = "do" | "plan" | "delegate" | "later";

export type WorkspaceType = "personal" | "family" | "team";

export type WorkspacePlan = "free" | "pro";

/** Purchasable Pro tier (enterprise workspaces map to "team"). */
export type BillingTier = "personal" | "family" | "team";

export type BillingCurrency = "usd" | "mxn";

export type BillingPeriod = "monthly" | "yearly";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled";

export type WorkspaceRole = "owner" | "admin" | "leader" | "member";

export type TaskKind = "task" | "meeting";

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export type TaskApprovalStatus = "pending_approval" | "approved" | "rejected";

export type NotificationKind =
  | "assigned"
  | "updated"
  | "meeting_created"
  | "deadline_approaching"
  | "completed"
  | "workspace_invitation"
  | "role_changed"
  | "blocked_day_pending_approval"
  | "blocked_day_approved"
  | "blocked_day_rejected"
  | "task_approved"
  | "task_rejected"
  | "approval_requested";

export type NotificationDelivery = "toast" | "bell" | "both";

export type BlockedDayStatus = "pending" | "approved" | "rejected";

// ─── Domain interfaces ────────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  plan: WorkspacePlan;
  isFrozen: boolean;
  blockedDaysRequireApproval: boolean;
  autoPromoteDueToDo: boolean;
  graceUntil: string | null;
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  workspaceId: string;
  plan: "pro";
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  quantity: number;
  trialEndsAt: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PlanResource =
  | "members"
  | "active_tasks"
  | "projects"
  | "assignees"
  | "blocked_days"
  | "agenda_events"
  | "workspaces"
  | "meetings";

/** Feature flags driven by plan_limits (no numeric quota). */
export type PlanFeature =
  | "plan_view"
  | "board_view"
  | "meetings"
  | "due_date"
  | "agenda_events";

export interface PlanLimits {
  plan: WorkspacePlan;
  workspaceType: WorkspaceType;
  memberLimit: number;
  activeTaskLimit: number;
  projectLimit: number;
  assigneeLimit: number;
  blockedDayLimit: number;
  workspaceLimit: number;
  agendaEventLimit: number;
  allowPlanView: boolean;
  allowBoardView: boolean;
  allowMeetings: boolean;
  allowDueDate: boolean;
  supportTier: string;
}

export interface WorkspaceUsage {
  members: number;
  activeTasks: number;
  projects: number;
  assignees: number;
  blockedDays: number;
  agendaEvents: number;
  workspaces: number;
}

export interface NotificationPreferences {
  email_task_assigned: boolean;
  email_meeting_created: boolean;
  email_deadline_approaching: boolean;
  email_daily_digest: boolean;
  push_task_assigned: boolean;
  push_meeting_created: boolean;
  push_deadline_approaching: boolean;
  push_task_due_soon: boolean;
}

export type NotificationChannel = "email" | "push";

export type NotificationEvent =
  | "task_assigned"
  | "meeting_created"
  | "deadline_approaching"
  | "daily_digest"
  | "task_due_soon";

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  agendaShared: boolean;
  recapMorningAt: string | null;
  recapEveningAt: string | null;
  recapTimezone: string;
  approvalGraceSeconds: number;
  notificationPreferences: NotificationPreferences;
  joinedAt: string;
}

export interface Assignee {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  linkedUserId: string | null;
  linkedUserIds: string[];
  isLead: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  assigneeId: string;
  role: "leader" | "member";
  addedAt: string;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  quadrant: Quadrant;
  kind: TaskKind;
  dueDate: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  meetingLink: string | null;
  completed: boolean;
  completedAt: string | null;
  requiresApproval: boolean;
  approved: boolean;
  rejected: boolean;
  rejectionReason: string | null;
  responsibleAssigneeId: string | null;
  assigneeIds: string[];
  isActive: boolean;
  blockOverrideId: string | null;
  graceStartedAt: string | null;
  submitFinalizedAt: string | null;
  recurrenceFreq: RecurrenceFreq | null;
  recurrenceInterval: number;
  recurrenceEndDate: string | null;
  recurrenceCount: number | null;
  recurrenceParentId: string | null;
  approvalRequestedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAssignee {
  id: string;
  taskId: string;
  assigneeId: string;
  isPrimary: boolean;
  addedAt: string;
}

export interface MeetingParticipant {
  id: string;
  taskId: string;
  userId: string;
  kind: "meeting";
  addedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  taskId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  read: boolean;
  delivery: NotificationDelivery;
  createdAt: string;
}

export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
}

export interface UserBlockedDay {
  id: string;
  userId: string;
  workspaceId: string;
  blockedDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  status: BlockedDayStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  action: string;
  changes: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

// ─── DB Row types (snake_case) ────────────────────────────

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  type: WorkspaceType;
  plan: WorkspacePlan;
  is_frozen: boolean;
  blocked_days_require_approval: boolean;
  auto_promote_due_to_do: boolean;
  grace_until: string | null;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  workspace_id: string;
  plan: "pro";
  status: SubscriptionStatus;
  current_period_end: string | null;
  quantity: number;
  trial_ends_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanLimitsRow {
  plan: WorkspacePlan;
  workspace_type: WorkspaceType;
  member_limit: number;
  active_task_limit: number;
  project_limit: number;
  assignee_limit: number;
  blocked_day_limit: number;
  workspace_limit: number;
  agenda_event_limit: number;
  allow_plan_view: boolean;
  allow_board_view: boolean;
  allow_meetings: boolean;
  allow_due_date: boolean;
  support_tier: string;
}

export interface AgendaEvent {
  id: string;
  workspaceId: string;
  title: string;
  startsAt: string;
  createdBy: string;
  createdAt: string;
}

export interface AgendaEventRow {
  id: string;
  workspace_id: string;
  title: string;
  starts_at: string;
  created_by: string;
  created_at: string;
}

export interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  agenda_shared: boolean;
  recap_morning_at: string | null;
  recap_evening_at: string | null;
  recap_timezone: string;
  approval_grace_seconds: number;
  notification_preferences: NotificationPreferences;
  joined_at: string;
}

export interface AssigneeRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  linked_user_id: string | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  quadrant: Quadrant;
  kind: TaskKind;
  due_date: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  meeting_link: string | null;
  completed: boolean;
  completed_at: string | null;
  requires_approval: boolean;
  approved: boolean;
  rejected: boolean;
  rejection_reason: string | null;
  responsible_assignee_id: string | null;
  is_active: boolean;
  block_override_id: string | null;
  grace_started_at: string | null;
  submit_finalized_at: string | null;
  recurrence_freq: RecurrenceFreq | null;
  recurrence_interval: number;
  recurrence_end_date: string | null;
  recurrence_count: number | null;
  recurrence_parent_id: string | null;
  approval_requested_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  task_id: string | null;
  workspace_id: string | null;
  project_id: string | null;
  read: boolean;
  delivery: NotificationDelivery;
  created_at: string;
}

export interface InvitationRow {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by: string;
  accepted_at: string | null;
  created_at: string;
}

// ─── Payloads ─────────────────────────────────────────────

export interface CreateTaskPayload {
  workspaceId: string;
  projectId?: string | null;
  title: string;
  description?: string | null;
  quadrant: Quadrant;
  kind?: TaskKind;
  dueDate?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
  meetingLink?: string | null;
  requiresApproval?: boolean;
  assigneeIds?: string[];
  recurrenceFreq?: RecurrenceFreq | null;
  recurrenceInterval?: number;
  recurrenceEndDate?: string | null;
  recurrenceCount?: number | null;
  approvalRequestedAt?: string | null;
  createdBy: string;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string | null;
  quadrant?: Quadrant;
  kind?: TaskKind;
  dueDate?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
  meetingLink?: string | null;
  projectId?: string | null;
  completed?: boolean;
  requiresApproval?: boolean;
  approved?: boolean;
  rejected?: boolean;
  rejectionReason?: string | null;
  approvalRequestedAt?: string | null;
  assigneeIds?: string[];
  recurrenceFreq?: RecurrenceFreq | null;
  recurrenceInterval?: number;
  recurrenceEndDate?: string | null;
  recurrenceCount?: number | null;
}
