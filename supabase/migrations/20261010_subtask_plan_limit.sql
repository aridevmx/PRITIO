-- PRITIO — Límite de subtareas por plan — IDEMPOTENTE
-- Migration 20261010
--   * plan_limits gana columna subtask_limit (free = 10, pro = 20).
--   * El trigger enforce_subtask_limit valida contra plan_limits según el
--     plan efectivo del workspace de la tarea (en vez del tope fijo de 20).

ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS subtask_limit INTEGER NOT NULL DEFAULT 20;

UPDATE plan_limits SET subtask_limit = 10 WHERE plan = 'free';
UPDATE plan_limits SET subtask_limit = 20 WHERE plan = 'pro';

CREATE OR REPLACE FUNCTION enforce_subtask_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_workspace_id UUID;
  v_workspace_type public.workspace_type;
  v_plan TEXT;
  v_limit INTEGER;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM tasks WHERE id = NEW.task_id;

  SELECT type INTO v_workspace_type FROM public.workspaces WHERE id = v_workspace_id;
  IF v_workspace_type IS NULL THEN
    v_workspace_type := 'personal'::public.workspace_type;
  END IF;

  SELECT plan INTO v_plan
  FROM public.subscriptions
  WHERE workspace_id = v_workspace_id
    AND plan = 'pro' AND status IN ('active', 'trialing', 'past_due')
  LIMIT 1;
  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  SELECT subtask_limit INTO v_limit
  FROM public.plan_limits
  WHERE plan = v_plan AND workspace_type = v_workspace_type;

  IF v_limit IS NULL THEN
    v_limit := 10;
  END IF;

  -- AFTER ROW: ve los inserts previos del mismo statement, así que los
  -- createSubtasks masivos también quedan topados.
  SELECT count(*) INTO v_count FROM public.task_subtasks WHERE task_id = NEW.task_id;
  IF v_count > v_limit THEN
    RAISE EXCEPTION 'Una tarea puede tener máximo % subtareas', v_limit;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_subtasks_limit ON task_subtasks;

CREATE TRIGGER task_subtasks_limit
AFTER INSERT ON task_subtasks
FOR EACH ROW
EXECUTE FUNCTION enforce_subtask_limit();