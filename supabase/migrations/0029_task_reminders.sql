-- PRITIO V1 — Task reminders
-- Migration 0029: per-task reminders delivered in-app, by email and push.
-- A cron invokes the `task-reminders` edge function periodically; it scans
-- rows with notified = false and remind_at <= now(), delivers notifications
-- to the task's assignees and marks them as notified.

CREATE TABLE IF NOT EXISTS task_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, remind_at, created_by)
);

CREATE INDEX IF NOT EXISTS task_reminders_due_idx
  ON task_reminders (remind_at)
  WHERE notified = false;

CREATE INDEX IF NOT EXISTS task_reminders_task_idx
  ON task_reminders (task_id);

ALTER TABLE task_reminders ENABLE ROW LEVEL SECURITY;

-- A user sees reminders they created plus reminders on tasks they are
-- assigned to (so co-assignees can see when someone scheduled a reminder).
CREATE POLICY task_reminders_select ON task_reminders
  FOR SELECT USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM task_assignees ta
      JOIN assignees a ON a.id = ta.assignee_id
      WHERE ta.task_id = task_reminders.task_id
        AND a.linked_user_id = auth.uid()
    )
  );

CREATE POLICY task_reminders_insert ON task_reminders
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY task_reminders_delete ON task_reminders
  FOR DELETE USING (created_by = auth.uid());
