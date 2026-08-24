-- PRITIO — Notas enriquecidas (Tiptap) y subtareas
-- Migration 0031: descriptions pasan a HTML rico + nueva tabla task_subtasks

-- ─── Notas: envolver descripciones de texto plano existentes en <p> ─

UPDATE tasks
SET description = '<p>' || replace(replace(description, chr(13) || chr(10), '</p><p>'), chr(10), '</p><p>') || '</p>'
WHERE description IS NOT NULL
  AND description <> ''
  AND position('<' in description) = 0;

-- ─── Subtareas (1 nivel, tabla dedicada) ────────────────

CREATE TABLE task_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE task_subtasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_task_subtasks_task_id ON task_subtasks(task_id);
CREATE INDEX idx_task_subtasks_workspace_id ON task_subtasks(workspace_id);

CREATE POLICY "task_subtasks: select if workspace member"
  ON task_subtasks FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "task_subtasks: insert if workspace member"
  ON task_subtasks FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "task_subtasks: update if workspace member"
  ON task_subtasks FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "task_subtasks: delete if workspace member"
  ON task_subtasks FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE TRIGGER task_subtasks_updated_at
  BEFORE UPDATE ON task_subtasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
