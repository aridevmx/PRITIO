// Priorify V1 — Notification preference helpers
// Maps a notification kind + channel to the workspace_members.notification_preferences key.

export type NotificationKind = "assigned" | "updated" | "meeting_created" | "deadline_approaching" | "completed";

export type NotificationChannel = "email" | "push";

export const DEFAULT_PREFS: Record<string, boolean> = {
  email_task_assigned: true,
  email_meeting_created: true,
  email_deadline_approaching: true,
  email_daily_digest: true,
  push_task_assigned: true,
  push_meeting_created: true,
  push_deadline_approaching: true,
  push_task_due_soon: true,
};

// Kinds with no dedicated toggle (updated/completed) always notify — lifecycle events.
const KIND_TO_PREF: Record<NotificationKind, Partial<Record<NotificationChannel, string>>> = {
  assigned: { email: "email_task_assigned", push: "push_task_assigned" },
  meeting_created: { email: "email_meeting_created", push: "push_meeting_created" },
  deadline_approaching: { email: "email_deadline_approaching", push: "push_deadline_approaching" },
  updated: {},
  completed: {},
};

export function isNotificationEnabled(
  kind: NotificationKind,
  channel: NotificationChannel,
  prefs?: Record<string, boolean> | null,
): boolean {
  const key = KIND_TO_PREF[kind]?.[channel];
  if (!key) return true;
  return prefs?.[key] ?? DEFAULT_PREFS[key];
}
