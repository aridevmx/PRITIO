-- Inbox: capturas rápidas pendientes de triaje.
--
-- El Quick Add crea tareas con inboxed = true. La tarea sale de Inbox cuando
-- el usuario le asigna cuadrante/fecha/proyecto (triaje) o la edita desde el
-- formulario completo.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS inboxed boolean NOT NULL DEFAULT false;

-- Índice parcial para listar únicamente capturas activas sin decidir.
CREATE INDEX IF NOT EXISTS tasks_inboxed_active_idx
  ON tasks (workspace_id, created_at DESC)
  WHERE inboxed = true AND is_active = true;