-- PRITIO - Metadatos en subtareas: fecha de inicio, fecha límite y cuadrante
-- Migration 20260912: siguen el mismo modelo que start_date / due_date / quadrant en tasks

ALTER TABLE task_subtasks
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS quadrant TEXT;

CREATE INDEX IF NOT EXISTS idx_task_subtasks_due_date ON task_subtasks(due_date);

-- Igual que en tasks: solo valores válidos del cuadrante Eisenhower.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'task_subtasks'::regclass
      AND conname = 'task_subtasks_quadrant_check'
  ) THEN
    RETURN;
  END IF;
  ALTER TABLE task_subtasks
    ADD CONSTRAINT task_subtasks_quadrant_check
    CHECK ((quadrant IS NULL) OR (quadrant IN ('do', 'plan', 'delegate', 'later')));
END
$$;