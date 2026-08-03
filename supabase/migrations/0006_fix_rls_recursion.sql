-- Fix RLS infinite recursion in workspace_members policies
-- The subqueries reading workspace_members from within workspace_members policies
-- cause "infinite recursion detected in policy for relation" (42P17).

-- SECURITY DEFINER helpers bypass RLS to break the cycle
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = uid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(ws_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = uid AND role IN ('owner', 'admin')
  );
$$;

-- Recreate workspace_members SELECT policy (was recursive for non-self rows)
DROP POLICY IF EXISTS "members: select if self or workspace member" ON public.workspace_members;
CREATE POLICY "members: select if self or workspace member"
  ON public.workspace_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_workspace_member(workspace_id, auth.uid())
  );

-- Recreate workspace_members INSERT policy (was recursive in WITH CHECK subquery)
DROP POLICY IF EXISTS "members: insert if workspace admin" ON public.workspace_members;
CREATE POLICY "members: insert if workspace admin"
  ON public.workspace_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_workspace_admin(workspace_id, auth.uid())
  );

-- Fix workspaces SELECT policy similarly (safe today, but prophylactic)
DROP POLICY IF EXISTS "workspaces: select if member" ON public.workspaces;
CREATE POLICY "workspaces: select if member"
  ON public.workspaces FOR SELECT
  USING (
    is_workspace_member(id, auth.uid())
  );

-- Fix all other tables that use the same recursive subquery pattern
DROP POLICY IF EXISTS "assignees: select if workspace member" ON public.assignees;
CREATE POLICY "assignees: select if workspace member"
  ON public.assignees FOR SELECT
  USING (
    is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "assignees: insert if workspace member" ON public.assignees;
CREATE POLICY "assignees: insert if workspace member"
  ON public.assignees FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "projects: select if workspace member" ON public.projects;
CREATE POLICY "projects: select if workspace member"
  ON public.projects FOR SELECT
  USING (
    is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "projects: insert if workspace member" ON public.projects;
CREATE POLICY "projects: insert if workspace member"
  ON public.projects FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "tasks: select if workspace member" ON public.tasks;
CREATE POLICY "tasks: select if workspace member"
  ON public.tasks FOR SELECT
  USING (
    is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "tasks: insert if workspace member" ON public.tasks;
CREATE POLICY "tasks: insert if workspace member"
  ON public.tasks FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "tasks: update if workspace member" ON public.tasks;
CREATE POLICY "tasks: update if workspace member"
  ON public.tasks FOR UPDATE
  USING (
    is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "invitations: select if workspace admin" ON public.invitations;
CREATE POLICY "invitations: select if workspace admin"
  ON public.invitations FOR SELECT
  USING (
    is_workspace_admin(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "invitations: insert if workspace admin" ON public.invitations;
CREATE POLICY "invitations: insert if workspace admin"
  ON public.invitations FOR INSERT
  WITH CHECK (
    is_workspace_admin(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "invitations: update if invited" ON public.invitations;
CREATE POLICY "invitations: update if invited"
  ON public.invitations FOR UPDATE
  USING (
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    OR is_workspace_admin(workspace_id, auth.uid())
  );
