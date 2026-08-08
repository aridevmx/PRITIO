-- PRITIO V1 — Add missing INSERT policies
-- Migration 0002: INSERT policies for profiles, workspaces, workspace_members

-- Profiles: allow users to insert their own profile after signup
CREATE POLICY "profiles: insert own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Workspaces: allow authenticated users to create workspaces
CREATE POLICY "workspaces: insert if authenticated"
  ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Workspace members: allow workspace owners/admins to add members
CREATE POLICY "members: insert if workspace admin"
  ON workspace_members FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR user_id = auth.uid()
  );

-- Tasks: allow insert with valid workspace (already exists, but adding explicit check)
-- Projects: allow insert for workspace members
CREATE POLICY "projects: insert if workspace member"
  ON projects FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Assignees: allow insert for workspace members
CREATE POLICY "assignees: insert if workspace member"
  ON assignees FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Task assignees: allow insert for workspace members
CREATE POLICY "task_assignees: insert if workspace member"
  ON task_assignees FOR INSERT
  WITH CHECK (
    task_id IN (
      SELECT id FROM tasks
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Task assignees: allow delete for workspace members
CREATE POLICY "task_assignees: delete if workspace member"
  ON task_assignees FOR DELETE
  USING (
    task_id IN (
      SELECT id FROM tasks
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Notifications: allow insert for system (service role) or self
CREATE POLICY "notifications: insert if own"
  ON notifications FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Invitations: allow insert for workspace admins
CREATE POLICY "invitations: insert if workspace admin"
  ON invitations FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Invitations: allow update for invited user (to accept)
CREATE POLICY "invitations: update if invited"
  ON invitations FOR UPDATE
  USING (
    email = (SELECT email FROM profiles WHERE id = auth.uid())
    OR workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
