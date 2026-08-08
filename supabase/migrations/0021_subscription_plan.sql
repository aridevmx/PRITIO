-- PRITIO V1 — Subscription system (account-level Free / Pro / Lifetime)
-- Migration 0021
--
-- Plans:
--   free     → always free, per-workspace-type limits (plan_limits)
--   pro      → paid monthly/yearly subscription (account-level)
--   lifetime → pro forever + future updates; founders/supporters badge
--
-- Billing is not wired to a gateway yet: subscriptions rows are written by
-- the future checkout webhook (service_role) via upsert_subscription().

-- ─── 1. Workspaces: plan becomes legacy, defaults to 'free' ───────────────

ALTER TABLE workspaces ALTER COLUMN plan SET DEFAULT 'free';
UPDATE workspaces SET plan = 'free';

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
    VALUES ('Personal', 'personal'::workspace_type, 'free', false, false, false)
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
  v_plan TEXT;
  v_ws_limit INTEGER;
  v_ws_count INTEGER;
  v_ws_type workspace_type;
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
    v_ws_type := p_type::workspace_type;
    v_plan := effective_plan(p_user_id);

    SELECT workspace_limit INTO v_ws_limit
    FROM plan_limits
    WHERE plan = v_plan AND workspace_type = v_ws_type;

    SELECT COUNT(*) INTO v_ws_count
    FROM workspace_members
    WHERE user_id = p_user_id;

    IF v_ws_limit IS NOT NULL AND v_ws_count >= v_ws_limit THEN
      RAISE EXCEPTION 'prio_plan_limit:workspaces';
    END IF;

    INSERT INTO workspaces (name, type, plan, is_frozen, blocked_days_require_approval, auto_promote_due_to_do)
    VALUES (p_name, v_ws_type, 'free', false, false, false)
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

-- ─── 2. Subscriptions (account-level billing records) ────────────────────

-- IF NOT EXISTS: the remote project already carried these objects from a manual
-- apply; the migration must be able to run on top of that state (idempotent).
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('pro', 'lifetime')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  current_period_end TIMESTAMPTZ,
  lifetime_activated_at TIMESTAMPTZ,
  supporter_tier TEXT CHECK (supporter_tier IN ('founder', 'supporter')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (plan <> 'lifetime' OR lifetime_activated_at IS NOT NULL)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions: select own" ON subscriptions;
CREATE POLICY "subscriptions: select own"
  ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies: only the service_role (billing webhook /
-- RPCs) writes subscriptions. Authenticated clients cannot tamper with them.

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_lifetime_one_per_user
  ON subscriptions (user_id)
  WHERE plan = 'lifetime';

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_pro_one_per_user
  ON subscriptions (user_id)
  WHERE plan = 'pro';

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_plan ON subscriptions (user_id, plan, status);

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── 3. Plan limits (shared source for server enforcement) ───────────────

CREATE TABLE IF NOT EXISTS plan_limits (
  plan TEXT NOT NULL CHECK (plan IN ('free', 'pro', 'lifetime')),
  workspace_type workspace_type NOT NULL,
  member_limit INTEGER NOT NULL,
  active_task_limit INTEGER NOT NULL,
  project_limit INTEGER NOT NULL,
  assignee_limit INTEGER NOT NULL,
  blocked_day_limit INTEGER NOT NULL,
  workspace_limit INTEGER NOT NULL,
  PRIMARY KEY (plan, workspace_type)
);

ALTER TABLE plan_limits ENABLE ROW LEVEL SECURITY;

-- Public read (pricing info); writes only via migration/service_role.
DROP POLICY IF EXISTS "plan_limits: read all" ON plan_limits;
CREATE POLICY "plan_limits: read all"
  ON plan_limits FOR SELECT
  USING (true);

-- Free limits scale with the workspace type; Pro/Lifetime lift them all to a
-- shared, data-bounded ceiling (see PRODUCT.md: hosted on Supabase free tier,
-- 500 MB database → limits stay well within the data budget).
INSERT INTO plan_limits (plan, workspace_type, member_limit, active_task_limit, project_limit, assignee_limit, blocked_day_limit, workspace_limit) VALUES
  ('free',     'personal',   1,    100,    3,    3,    10,   3),
  ('free',     'family',     5,    500,    10,   10,   30,   3),
  ('free',     'team',       10,   1000,   20,   20,   30,   3),
  ('free',     'enterprise', 10,   1000,   20,   20,   30,   3),
  ('pro',      'personal',   50,   25000,  200,  200,  500,  10),
  ('pro',      'family',     50,   25000,  200,  200,  500,  10),
  ('pro',      'team',       50,   25000,  200,  200,  500,  10),
  ('pro',      'enterprise', 50,   25000,  200,  200,  500,  10),
  ('lifetime', 'personal',   50,   25000,  200,  200,  500,  10),
  ('lifetime', 'family',     50,   25000,  200,  200,  500,  10),
  ('lifetime', 'team',       50,   25000,  200,  200,  500,  10),
  ('lifetime', 'enterprise', 50,   25000,  200,  200,  500,  10)
ON CONFLICT (plan, workspace_type) DO NOTHING;

-- ─── 4. Plan resolution helpers ───────────────────────────────────────────

-- Effective plan for a user: lifetime > pro > free. A paid plan in grace
-- (past_due) still counts while the grace window is open.
CREATE OR REPLACE FUNCTION effective_plan(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  SELECT plan INTO v_plan
  FROM subscriptions
  WHERE user_id = p_user_id AND status IN ('active', 'trialing', 'past_due')
    AND plan = 'lifetime'
  LIMIT 1;
  IF v_plan IS NOT NULL THEN
    RETURN 'lifetime';
  END IF;

  SELECT plan INTO v_plan
  FROM subscriptions
  WHERE user_id = p_user_id AND status IN ('active', 'trialing', 'past_due')
    AND plan = 'pro'
  ORDER BY COALESCE(current_period_end, now()) DESC
  LIMIT 1;
  IF v_plan IS NOT NULL THEN
    RETURN 'pro';
  END IF;

  RETURN 'free';
END;
$$;

CREATE OR REPLACE FUNCTION my_effective_plan()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN effective_plan(auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION list_subscriptions()
RETURNS SETOF subscriptions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM subscriptions WHERE user_id = auth.uid() ORDER BY created_at ASC;
$$;

-- Current resource usage for a workspace (member-guarded). Used by the client
-- for progressive gates; the insert triggers are the authoritative backstop.
CREATE OR REPLACE FUNCTION current_usage(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_usage JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'members', (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = p_workspace_id),
    'active_tasks', (SELECT COUNT(*) FROM tasks WHERE workspace_id = p_workspace_id AND is_active = true),
    'projects', (SELECT COUNT(*) FROM projects WHERE workspace_id = p_workspace_id),
    'assignees', (SELECT COUNT(*) FROM assignees WHERE workspace_id = p_workspace_id),
    'blocked_days', (SELECT COUNT(*) FROM user_blocked_days
                     WHERE workspace_id = p_workspace_id AND blocked_date >= CURRENT_DATE AND status <> 'rejected')
  ) INTO v_usage;

  RETURN v_usage;
END;
$$;

-- ─── 5. Quota enforcement (server-side, cannot be bypassed via inserts) ──

-- Per-resource quota on inserts for a workspace. Raises:
--   prio_plan_limit:<resource>   resource ∈ members | active_tasks | projects |
--                                assignees | blocked_days
CREATE OR REPLACE FUNCTION assert_workspace_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator UUID;
  v_plan TEXT;
  v_workspace_id UUID;
  v_workspace_type workspace_type;
  v_limits RECORD;
  v_limit INTEGER;
  v_current INTEGER;
  v_resource TEXT;
BEGIN
  v_creator := auth.uid();
  IF v_creator IS NULL THEN
    RETURN NEW;
  END IF;

  v_workspace_id := NEW.workspace_id;
  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT type INTO v_workspace_type FROM workspaces WHERE id = v_workspace_id;
  IF v_workspace_type IS NULL THEN
    RETURN NEW;
  END IF;

  v_plan := effective_plan(v_creator);

  SELECT member_limit, active_task_limit, project_limit, assignee_limit, blocked_day_limit
  INTO v_limits
  FROM plan_limits
  WHERE plan = v_plan AND workspace_type = v_workspace_type;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'tasks' THEN
      v_resource := 'active_tasks';
      v_limit := v_limits.active_task_limit;
      SELECT COUNT(*) INTO v_current FROM tasks
      WHERE workspace_id = v_workspace_id AND is_active = true;
    WHEN 'projects' THEN
      v_resource := 'projects';
      v_limit := v_limits.project_limit;
      SELECT COUNT(*) INTO v_current FROM projects
      WHERE workspace_id = v_workspace_id;
    WHEN 'assignees' THEN
      v_resource := 'assignees';
      v_limit := v_limits.assignee_limit;
      SELECT COUNT(*) INTO v_current FROM assignees
      WHERE workspace_id = v_workspace_id;
    WHEN 'user_blocked_days' THEN
      v_resource := 'blocked_days';
      v_limit := v_limits.blocked_day_limit;
      SELECT COUNT(*) INTO v_current FROM user_blocked_days
      WHERE workspace_id = v_workspace_id
        AND blocked_date >= CURRENT_DATE
        AND status <> 'rejected';
    WHEN 'workspace_members' THEN
      v_resource := 'members';
      v_limit := v_limits.member_limit;
      SELECT COUNT(*) INTO v_current FROM workspace_members
      WHERE workspace_id = v_workspace_id;
    WHEN 'invitations' THEN
      v_resource := 'members';
      v_limit := v_limits.member_limit;
      SELECT COUNT(*) INTO v_current FROM workspace_members
      WHERE workspace_id = v_workspace_id;
      v_current := v_current + (
        SELECT COUNT(*) FROM invitations
        WHERE workspace_id = v_workspace_id AND accepted_at IS NULL
      );
    ELSE
      RETURN NEW;
  END CASE;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'prio_plan_limit:%', v_resource;
  END IF;

  RETURN NEW;
END;
$$;

-- Account-level workspace creation quota (only owners create workspaces).
CREATE OR REPLACE FUNCTION assert_account_workspace_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator UUID;
  v_plan TEXT;
  v_workspace_type workspace_type;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  v_creator := auth.uid();
  IF v_creator IS NULL OR TG_TABLE_NAME <> 'workspace_members' OR NEW.role <> 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT type INTO v_workspace_type FROM workspaces WHERE id = NEW.workspace_id;
  IF v_workspace_type IS NULL THEN
    RETURN NEW;
  END IF;

  v_plan := effective_plan(v_creator);

  SELECT workspace_limit INTO v_limit
  FROM plan_limits
  WHERE plan = v_plan AND workspace_type = v_workspace_type;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count FROM workspace_members WHERE user_id = v_creator;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'prio_plan_limit:workspaces';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quota_tasks ON tasks;
CREATE TRIGGER quota_tasks
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION assert_workspace_quota();

DROP TRIGGER IF EXISTS quota_projects ON projects;
CREATE TRIGGER quota_projects
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION assert_workspace_quota();

DROP TRIGGER IF EXISTS quota_assignees ON assignees;
CREATE TRIGGER quota_assignees
  BEFORE INSERT ON assignees
  FOR EACH ROW EXECUTE FUNCTION assert_workspace_quota();

DROP TRIGGER IF EXISTS quota_blocked_days ON user_blocked_days;
CREATE TRIGGER quota_blocked_days
  BEFORE INSERT ON user_blocked_days
  FOR EACH ROW EXECUTE FUNCTION assert_workspace_quota();

DROP TRIGGER IF EXISTS quota_invitations ON invitations;
CREATE TRIGGER quota_invitations
  BEFORE INSERT ON invitations
  FOR EACH ROW EXECUTE FUNCTION assert_workspace_quota();

DROP TRIGGER IF EXISTS quota_members ON workspace_members;
CREATE TRIGGER quota_members
  BEFORE INSERT ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION assert_workspace_quota();

DROP TRIGGER IF EXISTS quota_workspace_count ON workspace_members;
CREATE TRIGGER quota_workspace_count
  BEFORE INSERT ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION assert_account_workspace_quota();

-- ─── 6. Billing administration RPCs (service_role only) ───────────────────

-- Upsert a subscription. Used by the future checkout/payment webhook.
-- p_plan 'lifetime' → grants pro forever + sets supporter tier + activation.
-- p_plan 'pro'     → records the current billing period.
CREATE OR REPLACE FUNCTION upsert_subscription(
  p_user_id UUID,
  p_plan TEXT,
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_supporter_tier TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row subscriptions%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_plan = 'lifetime' THEN
    INSERT INTO subscriptions (user_id, plan, status, current_period_end, lifetime_activated_at, supporter_tier)
    VALUES (p_user_id, 'lifetime', 'active', NULL, now(), COALESCE(p_supporter_tier, 'supporter'))
    ON CONFLICT (user_id) WHERE plan = 'lifetime'
    DO UPDATE SET
      status = 'active',
      lifetime_activated_at = COALESCE(subscriptions.lifetime_activated_at, EXCLUDED.lifetime_activated_at),
      supporter_tier = EXCLUDED.supporter_tier,
      updated_at = now()
    RETURNING * INTO v_row;
  ELSIF p_plan = 'pro' THEN
    INSERT INTO subscriptions (user_id, plan, status, current_period_end, supporter_tier)
    VALUES (p_user_id, 'pro', 'active', p_period_end, NULL)
    ON CONFLICT (user_id) WHERE plan = 'pro'
    DO UPDATE SET
      status = 'active',
      current_period_end = EXCLUDED.current_period_end,
      updated_at = now()
    RETURNING * INTO v_row;
  ELSE
    RAISE EXCEPTION 'invalid plan: %', p_plan;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'plan', v_row.plan,
    'status', v_row.status,
    'current_period_end', v_row.current_period_end,
    'lifetime_activated_at', v_row.lifetime_activated_at,
    'supporter_tier', v_row.supporter_tier
  );
END;
$$;
