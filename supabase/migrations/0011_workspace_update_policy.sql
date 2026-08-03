-- PRIO V1 — Workspace UPDATE policy
-- Migration 0011: add missing RLS UPDATE policy for workspaces table

DROP POLICY IF EXISTS "workspaces: update if admin" ON public.workspaces;

CREATE POLICY "workspaces: update if admin"
  ON public.workspaces FOR UPDATE
  USING (is_workspace_admin(id, auth.uid()))
  WITH CHECK (is_workspace_admin(id, auth.uid()));
