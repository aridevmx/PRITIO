-- Fix duplicate personal workspaces on first login.
--
-- During signup, several code paths run concurrently (init effect,
-- onAuthStateChange and the realtime workspace_members subscription), and each
-- one that observed "no workspaces" called create_workspace. Without any guard
-- the RPC created a new "Personal" workspace per call (observed: 4).
--
-- Make both RPCs idempotent: if the user already has a workspace of the same
-- type, return the existing one instead of creating a duplicate.

DROP FUNCTION IF EXISTS create_personal_workspace(UUID);
DROP FUNCTION IF EXISTS create_workspace(TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION create_personal_workspace(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_result JSONB;
BEGIN
  SELECT w.id INTO v_workspace_id
  FROM workspaces w
  JOIN workspace_members m ON m.workspace_id = w.id
  WHERE m.user_id = p_user_id AND w.type = 'personal'::workspace_type
  ORDER BY w.created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    INSERT INTO workspaces (name, type, plan, is_frozen, blocked_days_require_approval, auto_promote_due_to_do)
    VALUES ('Personal', 'personal'::workspace_type, 'personal_free', false, false, false)
    RETURNING id INTO v_workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, role, agenda_shared, recap_timezone, approval_grace_seconds)
    VALUES (v_workspace_id, p_user_id, 'owner', false, 'America/Mexico_City', 3600);
  END IF;

  SELECT jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'type', w.type,
    'plan', w.plan,
    'is_frozen', w.is_frozen,
    'blocked_days_require_approval', w.blocked_days_require_approval,
    'auto_promote_due_to_do', w.auto_promote_due_to_do,
    'created_at', w.created_at
  ) INTO v_result
  FROM workspaces w
  WHERE w.id = v_workspace_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION create_workspace(p_name TEXT, p_type TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_result JSONB;
BEGIN
  SELECT w.id INTO v_workspace_id
  FROM workspaces w
  JOIN workspace_members m ON m.workspace_id = w.id
  WHERE m.user_id = p_user_id
    AND p_type::workspace_type = 'personal'::workspace_type
    AND w.type = 'personal'::workspace_type
  ORDER BY w.created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    INSERT INTO workspaces (name, type, plan, is_frozen, blocked_days_require_approval, auto_promote_due_to_do)
    VALUES (p_name, p_type::workspace_type, 'personal_free', false, false, false)
    RETURNING id INTO v_workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, role, agenda_shared, recap_timezone, approval_grace_seconds)
    VALUES (v_workspace_id, p_user_id, 'owner', false, 'America/Mexico_City', 3600);
  END IF;

  SELECT jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'type', w.type,
    'plan', w.plan,
    'is_frozen', w.is_frozen,
    'blocked_days_require_approval', w.blocked_days_require_approval,
    'auto_promote_due_to_do', w.auto_promote_due_to_do,
    'created_at', w.created_at
  ) INTO v_result
  FROM workspaces w
  WHERE w.id = v_workspace_id;

  RETURN v_result;
END;
$$;
