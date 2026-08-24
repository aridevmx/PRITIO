-- PRITIO — Límites de contenido para tareas y subtareas
-- Migration 0035 — IDEMPOTENTE
--   * Título de tarea: máximo 120 caracteres (se recortan los existentes).
--   * Notas/descripción: máximo 4,000 caracteres VISIBLES (sin contar HTML).
--     Filas antiguas que excedan quedan grandfathered hasta su próxima edición.
--   * Subtareas: máximo 20 por tarea (INSERT rechazado al exceder).

-- ─── Recorte de títulos existentes ────────────────────────────────────────

UPDATE tasks SET title = left(title, 120) WHERE char_length(title) > 120;

-- ─── Validación de límites en tasks ───────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_task_text_limits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_visible TEXT;
BEGIN
  -- INSERT: siempre valida. UPDATE: solo cuando cambia el contenido relevante,
  -- así filas legacy con notas muy grandes siguen operables (completar, etc.)
  -- hasta que el usuario las edite.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title
       AND NEW.description IS NOT DISTINCT FROM OLD.description THEN
      RETURN NEW;
    END IF;
  END IF;

  IF char_length(NEW.title) > 120 THEN
    RAISE EXCEPTION 'El título no puede exceder 120 caracteres';
  END IF;

  IF NEW.description IS NOT NULL THEN
    v_visible := regexp_replace(NEW.description, '<[^>]*>', '', 'g');
    IF char_length(v_visible) > 4000 THEN
      RAISE EXCEPTION 'Las notas no pueden exceder 4,000 caracteres';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_text_limits ON tasks;

CREATE TRIGGER tasks_text_limits
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION validate_task_text_limits();

-- ─── Tope de subtareas por tarea ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_subtask_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- AFTER ROW: ve los inserts previos del mismo statement, así que los
  -- createSubtasks masivos también quedan topados.
  SELECT count(*) INTO v_count FROM task_subtasks WHERE task_id = NEW.task_id;
  IF v_count > 20 THEN
    RAISE EXCEPTION 'Una tarea puede tener máximo 20 subtareas';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_subtasks_limit ON task_subtasks;

CREATE TRIGGER task_subtasks_limit
AFTER INSERT ON task_subtasks
FOR EACH ROW
EXECUTE FUNCTION enforce_subtask_limit();
