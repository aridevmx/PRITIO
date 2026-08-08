-- PRITIO V1 — Approval request timestamp
-- Migration 0019: track when a task was submitted for approval so the approvals
-- list can show "enviada a aprobación" dates.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tasks_approval_pending_idx
  ON tasks (workspace_id)
  WHERE requires_approval IS TRUE AND approved IS FALSE AND rejected IS FALSE AND completed IS FALSE;

-- Next-occurrence generator must stamp the new task when it needs approval.

CREATE OR REPLACE FUNCTION create_next_recurrence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_interval INT;
  v_next_due DATE;
  v_next_start TIMESTAMPTZ;
  v_next_end TIMESTAMPTZ;
  v_next_id UUID;
  v_count INT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NOT (OLD.completed IS TRUE) AND (NEW.completed IS TRUE)
     AND NEW.recurrence_freq IS NOT NULL THEN

    v_interval := GREATEST(COALESCE(NEW.recurrence_interval, 1), 1);

    IF NEW.due_date IS NOT NULL THEN
      v_next_due := CASE NEW.recurrence_freq
        WHEN 'daily'   THEN NEW.due_date + v_interval
        WHEN 'weekly'  THEN NEW.due_date + (7 * v_interval)
        WHEN 'monthly' THEN NEW.due_date + make_interval(months => v_interval)
      END;
    END IF;

    IF NEW.start_at IS NOT NULL THEN
      IF NEW.due_date IS NOT NULL AND v_next_due IS NOT NULL THEN
        v_next_start := NEW.start_at + (v_next_due - NEW.due_date);
      ELSE
        v_next_start := CASE NEW.recurrence_freq
          WHEN 'daily'   THEN NEW.start_at + make_interval(days => v_interval)
          WHEN 'weekly'  THEN NEW.start_at + make_interval(days => 7 * v_interval)
          WHEN 'monthly' THEN NEW.start_at + make_interval(months => v_interval)
        END;
      END IF;
      IF NEW.end_at IS NOT NULL THEN
        IF NEW.due_date IS NOT NULL AND v_next_due IS NOT NULL THEN
          v_next_end := NEW.end_at + (v_next_due - NEW.due_date);
        ELSE
          v_next_end := NEW.end_at + (v_next_start - NEW.start_at);
        END IF;
      END IF;
    END IF;

    IF NEW.recurrence_end_date IS NOT NULL AND v_next_due IS NOT NULL
       AND v_next_due > NEW.recurrence_end_date THEN
      RETURN NEW;
    END IF;

    IF NEW.recurrence_count IS NOT NULL AND NEW.recurrence_count <= 1 THEN
      RETURN NEW;
    END IF;
    v_count := CASE WHEN NEW.recurrence_count IS NULL THEN NULL
                    ELSE NEW.recurrence_count - 1 END;

    v_next_id := gen_random_uuid();

    INSERT INTO tasks (
      id, workspace_id, project_id, title, description, quadrant, kind,
      due_date, start_at, end_at, location, meeting_link,
      completed, completed_at, requires_approval, approved, rejected, rejection_reason,
      responsible_assignee_id, is_active, created_by, approval_requested_at,
      recurrence_freq, recurrence_interval, recurrence_end_date, recurrence_count, recurrence_parent_id
    ) VALUES (
      v_next_id, NEW.workspace_id, NEW.project_id, NEW.title, NEW.description, NEW.quadrant, NEW.kind,
      v_next_due, v_next_start, v_next_end, NEW.location, NEW.meeting_link,
      false, NULL, NEW.requires_approval, NEW.approved, NEW.rejected, NEW.rejection_reason,
      NEW.responsible_assignee_id, true, NEW.created_by,
      CASE WHEN NEW.requires_approval THEN now() ELSE NULL END,
      NEW.recurrence_freq, NEW.recurrence_interval, NEW.recurrence_end_date, v_count, NEW.id
    );

    INSERT INTO task_assignees (task_id, assignee_id, is_primary)
      SELECT v_next_id, assignee_id, is_primary
      FROM task_assignees
      WHERE task_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_recurrence_trigger ON tasks;

CREATE TRIGGER tasks_recurrence_trigger
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION create_next_recurrence();
