-- PRIO V1 — RPC functions for workspace creation (bypass RLS)

-- Creates a personal workspace and adds the user as owner in a single transaction.
-- Uses SECURITY DEFINER to bypass RLS (the user is authenticated but cannot
-- insert into workspace_members before the workspace exists).
CREATE OR REPLACE FUNCTION create_personal_workspace(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  INSERT INTO workspaces (name, type, plan, is_frozen, blocked_days_require_approval, auto_promote_due_to_do)
  VALUES ('Personal', 'personal', 'personal_free', false, false, false)
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role, agenda_shared, recap_timezone, approval_grace_seconds)
  VALUES (v_workspace_id, p_user_id, 'owner', false, 'America/Mexico_City', 86400);

  RETURN v_workspace_id;
END;
$$;

-- Creates a workspace of the given type and adds the user as owner.
CREATE OR REPLACE FUNCTION create_workspace(name TEXT, type workspace_type, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  INSERT INTO workspaces (name, type, plan, is_frozen, blocked_days_require_approval, auto_promote_due_to_do)
  VALUES (create_workspace.name, create_workspace.type, 'personal_free', false, false, false)
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role, agenda_shared, recap_timezone, approval_grace_seconds)
  VALUES (v_workspace_id, p_user_id, 'owner', false, 'America/Mexico_City', 86400);

  RETURN v_workspace_id;
END;
$$;
