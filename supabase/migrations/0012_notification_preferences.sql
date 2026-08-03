-- Priorify V1 — Notification preferences
-- Migration 0012: add JSONB column for granular notification preferences

ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{
    "email_task_assigned": true,
    "email_meeting_created": true,
    "email_deadline_approaching": true,
    "email_daily_digest": true,
    "push_task_assigned": true,
    "push_meeting_created": true,
    "push_deadline_approaching": true,
    "push_task_due_soon": true
  }'::jsonb;
