-- PRITIO — Documentos v2: carpetas, visibilidad restringida, etiquetas,
-- vínculos con proyectos y colaboradores (permisos + externos).
-- Migration 0034 — IDEMPOTENTE: puede ejecutarse varias veces sin error.

-- ── Carpetas (árbol de profundidad arbitraria) ───────────────────────────

CREATE TABLE IF NOT EXISTS doc_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES doc_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 120),
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE doc_folders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_doc_folders_workspace_id ON doc_folders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_doc_folders_parent_id ON doc_folders(parent_id);

DROP POLICY IF EXISTS "doc_folders: select if workspace member" ON doc_folders;
DROP POLICY IF EXISTS "doc_folders: insert if workspace member" ON doc_folders;
DROP POLICY IF EXISTS "doc_folders: update if workspace member" ON doc_folders;
DROP POLICY IF EXISTS "doc_folders: delete if creator or admin" ON doc_folders;

CREATE POLICY "doc_folders: select if workspace member"
  ON doc_folders FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_folders: insert if workspace member"
  ON doc_folders FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_folders: update if workspace member"
  ON doc_folders FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_folders: delete if creator or admin"
  ON doc_folders FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = doc_folders.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

DROP TRIGGER IF EXISTS doc_folders_updated_at ON doc_folders;

CREATE TRIGGER doc_folders_updated_at
  BEFORE UPDATE ON doc_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── docs: carpeta padre + visibilidad ────────────────────────────────────

ALTER TABLE docs
  ADD COLUMN IF NOT EXISTS parent_folder_id UUID REFERENCES doc_folders(id) ON DELETE SET NULL;

ALTER TABLE docs
  ADD COLUMN IF NOT EXISTS visibility TEXT;

-- Asegurar default + CHECK (no-op si ya existen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'docs_visibility_check'
  ) THEN
    ALTER TABLE docs ADD CONSTRAINT docs_visibility_check
      CHECK (visibility IN ('workspace', 'restricted'));
  END IF;
END $$;

UPDATE docs SET visibility = 'workspace' WHERE visibility IS NULL;

ALTER TABLE docs
  ALTER COLUMN visibility SET DEFAULT 'workspace';

ALTER TABLE docs
  ALTER COLUMN visibility SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_docs_parent_folder_id ON docs(parent_folder_id);

-- ── Etiquetas ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doc_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 40),
  color TEXT NOT NULL DEFAULT '#5BA7D1',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS doc_tag_links (
  doc_id UUID NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES doc_tags(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, tag_id)
);

ALTER TABLE doc_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_tag_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_doc_tags_workspace_id ON doc_tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_links_doc_id ON doc_tag_links(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_links_tag_id ON doc_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_doc_tag_links_workspace_id ON doc_tag_links(workspace_id);

DROP POLICY IF EXISTS "doc_tags: select if workspace member" ON doc_tags;
DROP POLICY IF EXISTS "doc_tags: insert if workspace member" ON doc_tags;
DROP POLICY IF EXISTS "doc_tags: delete if creator or admin" ON doc_tags;

CREATE POLICY "doc_tags: select if workspace member"
  ON doc_tags FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_tags: insert if workspace member"
  ON doc_tags FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_tags: delete if creator or admin"
  ON doc_tags FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = doc_tags.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "doc_tag_links: select if workspace member" ON doc_tag_links;
DROP POLICY IF EXISTS "doc_tag_links: insert if workspace member" ON doc_tag_links;
DROP POLICY IF EXISTS "doc_tag_links: delete if workspace member" ON doc_tag_links;

CREATE POLICY "doc_tag_links: select if workspace member"
  ON doc_tag_links FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_tag_links: insert if workspace member"
  ON doc_tag_links FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_tag_links: delete if workspace member"
  ON doc_tag_links FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ── Vínculos con proyectos ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doc_project_links (
  doc_id UUID NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, project_id)
);

ALTER TABLE doc_project_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_doc_project_links_doc_id ON doc_project_links(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_project_links_project_id ON doc_project_links(project_id);
CREATE INDEX IF NOT EXISTS idx_doc_project_links_workspace_id ON doc_project_links(workspace_id);

DROP POLICY IF EXISTS "doc_project_links: select if workspace member" ON doc_project_links;
DROP POLICY IF EXISTS "doc_project_links: insert if workspace member" ON doc_project_links;
DROP POLICY IF EXISTS "doc_project_links: delete if workspace member" ON doc_project_links;

CREATE POLICY "doc_project_links: select if workspace member"
  ON doc_project_links FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_project_links: insert if workspace member"
  ON doc_project_links FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "doc_project_links: delete if workspace member"
  ON doc_project_links FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ── Colaboradores (permisos viewer/editor; internos y externos) ───────────

CREATE TABLE IF NOT EXISTS doc_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (char_length(email) <= 254),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doc_id, email)
);

ALTER TABLE doc_collaborators ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_doc_collaborators_doc_id ON doc_collaborators(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_collaborators_email ON doc_collaborators(email);

DROP POLICY IF EXISTS "doc_collaborators: select if related" ON doc_collaborators;
DROP POLICY IF EXISTS "doc_collaborators: insert if doc owner or admin" ON doc_collaborators;
DROP POLICY IF EXISTS "doc_collaborators: delete if doc owner or admin" ON doc_collaborators;

CREATE POLICY "doc_collaborators: select if related"
  ON doc_collaborators FOR SELECT
  USING (
    user_id = auth.uid()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = doc_collaborators.workspace_id
        AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "doc_collaborators: insert if doc owner or admin"
  ON doc_collaborators FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM docs d
      JOIN workspace_members m
        ON m.workspace_id = d.workspace_id
      WHERE d.id = doc_collaborators.doc_id
        AND m.user_id = auth.uid()
        AND (d.created_by = auth.uid() OR m.role IN ('owner', 'admin'))
    )
  );

CREATE POLICY "doc_collaborators: delete if doc owner or admin"
  ON doc_collaborators FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM docs d
      JOIN workspace_members m
        ON m.workspace_id = d.workspace_id
      WHERE d.id = doc_collaborators.doc_id
        AND m.user_id = auth.uid()
        AND (d.created_by = auth.uid() OR m.role IN ('owner', 'admin'))
    )
  );

-- ── docs: políticas v2 ────────────────────────────────────────────────────
-- En visibility='workspace' se conserva el comportamiento previo (todos los
-- miembros ven/editan). En 'restricted' solo creador, admins/owners y
-- colaboradores explícitos (por user_id o por email aún sin cuenta).

DROP POLICY IF EXISTS "docs: select if workspace member" ON docs;
DROP POLICY IF EXISTS "docs: update if workspace member" ON docs;
DROP POLICY IF EXISTS "docs: delete if workspace member" ON docs;
DROP POLICY IF EXISTS "docs: insert if workspace member" ON docs;
DROP POLICY IF EXISTS "docs: select per visibility" ON docs;
DROP POLICY IF EXISTS "docs: update per visibility" ON docs;
DROP POLICY IF EXISTS "docs: delete if allowed" ON docs;

CREATE POLICY "docs: select per visibility"
  ON docs FOR SELECT
  USING (
    (
      visibility = 'workspace'
      AND workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = docs.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM doc_collaborators c
      WHERE c.doc_id = docs.id
        AND (
          c.user_id = auth.uid()
          OR lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
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

CREATE POLICY "docs: update per visibility"
  ON docs FOR UPDATE
  USING (
    (
      visibility = 'workspace'
      AND workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = docs.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM doc_collaborators c
      WHERE c.doc_id = docs.id
        AND c.role = 'editor'
        AND (
          c.user_id = auth.uid()
          OR lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

CREATE POLICY "docs: delete if allowed"
  ON docs FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = docs.workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
    )
    OR (
      visibility = 'workspace'
      AND workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );
