-- PRITIO V1 — Recurring tasks
-- Migration 0018: recurrence columns on tasks + trigger that generates the
-- next occurrence when a recurring task is completed.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_freq TEXT,          -- 'daily' | 'weekly' | 'monthly' | NULL
  ADD COLUMN IF NOT EXISTS recurrence_interval INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_count INT,           -- remaining occurrences to create (NULL = until end_date / forever)
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_recurrence_parent_idx ON tasks(recurrence_parent_id);

-- ─── Next occurrence generator ──────────────────────────
-- Fires when a recurring task transitions to completed. Creates the following
-- occurrence copying title, project, assignees, meeting details, approval flags
-- and the (possibly decremented) recurrence config. Runs SECURITY DEFINER so the
-- insert bypasses RLS (the completing user may not be the row owner).

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

    -- Advance due date according to frequency
    IF NEW.due_date IS NOT NULL THEN
      v_next_due := CASE NEW.recurrence_freq
        WHEN 'daily'   THEN NEW.due_date + v_interval
        WHEN 'weekly'  THEN NEW.due_date + (7 * v_interval)
        WHEN 'monthly' THEN NEW.due_date + make_interval(months => v_interval)
      END;
    END IF;

    -- Advance start/end preserving the same day offset
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

    -- Stop when a fixed end date is reached
    IF NEW.recurrence_end_date IS NOT NULL AND v_next_due IS NOT NULL
       AND v_next_due > NEW.recurrence_end_date THEN
      RETURN NEW;
    END IF;

    -- Count-based termination: recurrence_count = occurrences still to create
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
      responsible_assignee_id, is_active, created_by,
      recurrence_freq, recurrence_interval, recurrence_end_date, recurrence_count, recurrence_parent_id
    ) VALUES (
      v_next_id, NEW.workspace_id, NEW.project_id, NEW.title, NEW.description, NEW.quadrant, NEW.kind,
      v_next_due, v_next_start, v_next_end, NEW.location, NEW.meeting_link,
      false, NULL, NEW.requires_approval, NEW.approved, NEW.rejected, NEW.rejection_reason,
      NEW.responsible_assignee_id, true, NEW.created_by,
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
