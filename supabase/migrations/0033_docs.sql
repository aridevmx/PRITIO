-- PRITIO — Documentos (notas enriquecidas) vinculables a tareas
-- Migration 0033: nueva tabla docs + relación N:M con tareas

CREATE TABLE docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doc_task_links (
  doc_id UUID NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, task_id)
);

ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_task_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_docs_workspace_id ON docs(workspace_id);
CREATE INDEX idx_doc_task_links_task_id ON doc_task_links(task_id);
CREATE INDEX idx_doc_task_links_workspace_id ON doc_task_links(workspace_id);

CREATE POLICY "docs: select if workspace member"
  ON docs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "docs: insert if workspace member"
  ON docs FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "docs: update if workspace member"
  ON docs FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "docs: delete if workspace member"
  ON docs FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_task_links: select if workspace member"
  ON doc_task_links FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_task_links: insert if workspace member"
  ON doc_task_links FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_task_links: delete if workspace member"
  ON doc_task_links FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE TRIGGER docs_updated_at
  BEFORE UPDATE ON docs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
