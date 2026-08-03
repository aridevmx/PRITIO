-- Fix SMALLINT overflow in RPC functions (86400 > 32767)
-- approval_grace_seconds is SMALLINT, valid range: -32768 to 32767

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
  INSERT INTO workspaces (name, type, plan, is_frozen, blocked_days_require_approval, auto_promote_due_to_do)
  VALUES ('Personal', 'personal'::workspace_type, 'personal_free', false, false, false)
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role, agenda_shared, recap_timezone, approval_grace_seconds)
  VALUES (v_workspace_id, p_user_id, 'owner', false, 'America/Mexico_City', 3600);

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
  INSERT INTO workspaces (name, type, plan, is_frozen, blocked_days_require_approval, auto_promote_due_to_do)
  VALUES (p_name, p_type::workspace_type, 'personal_free', false, false, false)
  RETURNING id INTO v_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role, agenda_shared, recap_timezone, approval_grace_seconds)
  VALUES (v_workspace_id, p_user_id, 'owner', false, 'America/Mexico_City', 3600);

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
