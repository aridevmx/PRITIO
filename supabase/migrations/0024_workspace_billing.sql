-- PRITIO V1 — Workspace-level Pro billing
-- Migration 0024
--
-- Moves Pro subscriptions from account-level to workspace-level:
--   * subscriptions gain workspace_id, quantity (paid seats), trial_ends_at
--     and stripe_subscription_id (for seat re-syncs)
--   * one Pro subscription per workspace (unique partial index)
--   * Lifetime is removed entirely (no production buyers)
--   * plan_limits are differentiated per Pro tier (Propuesta A)
--   * effective_plan() resolves per workspace; a new account-level helper keeps
--     the workspace-count quota working
--   * profiles.pro_trial_used_at enforces the one-time 14-day trial per account
--   * a pg_net trigger re-syncs Stripe seats when workspace membership changes

-- ─── 1. Subscriptions: per-workspace shape, drop Lifetime ─────────────────

-- Billing is test-mode only with no production buyers: legacy Lifetime rows
-- and account-level Pro rows (no workspace_id) are dropped; the latter cannot
-- be resolved to a workspace.
DELETE FROM subscriptions WHERE plan = 'lifetime';

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_check;

ALTER TABLE subscriptions
  ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN trial_ends_at TIMESTAMPTZ,
  ADD COLUMN stripe_subscription_id TEXT;

DROP INDEX IF EXISTS subscriptions_lifetime_one_per_user;
DROP INDEX IF EXISTS subscriptions_pro_one_per_user;

DELETE FROM subscriptions WHERE workspace_id IS NULL;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (plan = 'pro'),
  ADD CONSTRAINT subscriptions_workspace_required CHECK (workspace_id IS NOT NULL);

CREATE UNIQUE INDEX subscriptions_pro_one_per_workspace
  ON subscriptions (workspace_id)
  WHERE plan = 'pro';

CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_workspace ON subscriptions (workspace_id);

ALTER TABLE subscriptions DROP COLUMN lifetime_activated_at;
ALTER TABLE subscriptions DROP COLUMN supporter_tier;

-- ─── 2. One-time trial flag (per account) ─────────────────────────────────

ALTER TABLE profiles ADD COLUMN pro_trial_used_at TIMESTAMPTZ;

-- ─── 3. Plan limits: differentiate Pro tiers (Propuesta A) ────────────────

ALTER TABLE plan_limits DROP CONSTRAINT IF EXISTS plan_limits_plan_check;

DELETE FROM plan_limits WHERE plan = 'lifetime';

ALTER TABLE plan_limits
  ADD CONSTRAINT plan_limits_plan_check CHECK (plan IN ('free', 'pro'));

UPDATE plan_limits SET
  member_limit = CASE workspace_type
    WHEN 'personal' THEN 1
    WHEN 'family' THEN 10
    WHEN 'team' THEN 50
    WHEN 'enterprise' THEN 50 END,
  active_task_limit = CASE workspace_type
    WHEN 'personal' THEN 2500
    WHEN 'family' THEN 50000
    WHEN 'team' THEN 100000
    WHEN 'enterprise' THEN 100000 END,
  project_limit = CASE workspace_type
    WHEN 'personal' THEN 300
    WHEN 'family' THEN 100
    WHEN 'team' THEN 500
    WHEN 'enterprise' THEN 500 END,
  assignee_limit = CASE workspace_type
    WHEN 'personal' THEN 200
    WHEN 'family' THEN 100
    WHEN 'team' THEN 500
    WHEN 'enterprise' THEN 500 END,
  blocked_day_limit = CASE workspace_type
    WHEN 'personal' THEN 500
    WHEN 'family' THEN 500
    WHEN 'team' THEN 1000
    WHEN 'enterprise' THEN 1000 END,
  workspace_limit = 10
WHERE plan = 'pro';

-- ─── 4. Plan resolution: per workspace + account-level helper ─────────────

DROP FUNCTION IF EXISTS effective_plan(UUID);
DROP FUNCTION IF EXISTS my_effective_plan();

-- Effective plan for a specific workspace: pro if the workspace holds an
-- active/trialing/past_due Pro subscription, else free.
CREATE OR REPLACE FUNCTION effective_plan(p_user_id UUID, p_workspace_id UUID)
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
  WHERE user_id = p_user_id AND workspace_id = p_workspace_id
    AND plan = 'pro' AND status IN ('active', 'trialing', 'past_due')
  ORDER BY COALESCE(current_period_end, now()) DESC
  LIMIT 1;
  IF v_plan IS NOT NULL THEN
    RETURN v_plan;
  END IF;
  RETURN 'free';
END;
$$;

-- Account-level "any Pro" helper: true when the user pays for Pro on at least
-- one workspace. Used for the workspace-count quota (there is no single
-- "current workspace" during a workspace creation).
CREATE OR REPLACE FUNCTION effective_plan_account(p_user_id UUID)
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
  WHERE user_id = p_user_id
    AND plan = 'pro' AND status IN ('active', 'trialing', 'past_due')
  LIMIT 1;
  IF v_plan IS NOT NULL THEN
    RETURN v_plan;
  END IF;
  RETURN 'free';
END;
$$;

CREATE OR REPLACE FUNCTION my_effective_plan_account()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN effective_plan_account(auth.uid());
END;
$$;

-- ─── 5. Workspace RPCs: account-level plan for creation quota ─────────────

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
    v_plan := effective_plan_account(p_user_id);

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

-- ─── 6. Quota triggers: per-workspace plan resolution ─────────────────────

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

  v_plan := effective_plan(v_creator, v_workspace_id);

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

  v_plan := effective_plan_account(v_creator);

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

-- ─── 7. Billing administration RPCs (service_role only) ────────────────────

-- Legacy account-level signatures must be dropped before the workspace-level
-- rewrite (CREATE OR REPLACE only replaces functions with matching args).
-- 0021 introduced a 4-arg version; 0023 extended it to 5 args.
DROP FUNCTION IF EXISTS upsert_subscription(UUID, TEXT, TIMESTAMPTZ, TEXT);
DROP FUNCTION IF EXISTS upsert_subscription(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT);

-- Upsert the Pro subscription for a workspace. The unique partial index on
-- (workspace_id) makes the conflict target explicit.
CREATE OR REPLACE FUNCTION upsert_subscription(
  p_user_id UUID,
  p_workspace_id UUID,
  p_plan TEXT DEFAULT 'pro',
  p_period_end TIMESTAMPTZ DEFAULT NULL,
  p_status TEXT DEFAULT 'active',
  p_quantity INTEGER DEFAULT 1,
  p_trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL
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

  IF p_plan <> 'pro' THEN
    RAISE EXCEPTION 'invalid plan: %', p_plan;
  END IF;
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required';
  END IF;
  IF p_status NOT IN ('active', 'trialing', 'past_due', 'canceled') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  INSERT INTO subscriptions (
    user_id, workspace_id, plan, status, current_period_end,
    quantity, trial_ends_at, stripe_subscription_id
  )
  VALUES (
    p_user_id, p_workspace_id, 'pro', p_status, p_period_end,
    p_quantity, p_trial_ends_at, p_stripe_subscription_id
  )
  ON CONFLICT (workspace_id) WHERE plan = 'pro'
  DO UPDATE SET
    status = EXCLUDED.status,
    current_period_end = EXCLUDED.current_period_end,
    quantity = EXCLUDED.quantity,
    trial_ends_at = EXCLUDED.trial_ends_at,
    stripe_subscription_id = COALESCE(
      EXCLUDED.stripe_subscription_id,
      subscriptions.stripe_subscription_id
    ),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'workspace_id', v_row.workspace_id,
    'plan', v_row.plan,
    'status', v_row.status,
    'current_period_end', v_row.current_period_end,
    'quantity', v_row.quantity,
    'trial_ends_at', v_row.trial_ends_at,
    'stripe_subscription_id', v_row.stripe_subscription_id
  );
END;
$$;

-- Mark the one-time trial as used for an account (idempotent; only writes the
-- first timestamp). Called by the Stripe webhook when a trial subscription is
-- created.
CREATE OR REPLACE FUNCTION mark_pro_trial_used(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  UPDATE profiles SET pro_trial_used_at = COALESCE(pro_trial_used_at, now())
  WHERE id = p_user_id;
END;
$$;

-- Whether the current user already used their one-time trial.
CREATE OR REPLACE FUNCTION my_pro_trial_used()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT pro_trial_used_at IS NOT NULL
  FROM profiles
  WHERE id = auth.uid();
$$;

-- ─── 8. Seat re-sync trigger (pg_net → sync-seats edge function) ──────────

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net no disponible, sync de asientos desactivado: %', SQLERRM;
END $$;

-- Endpoint that receives the seat-change notification. Local default matches
-- `supabase start`; the hosted project must update this value after deploy.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO app_settings (key, value)
VALUES ('seats_sync_url', 'http://127.0.0.1:54321/functions/v1/sync-seats')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION notify_seat_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_url TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_workspace_id := OLD.workspace_id;
  ELSE
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE workspace_id = v_workspace_id AND plan = 'pro'
      AND status IN ('active', 'trialing', 'past_due')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_url FROM app_settings WHERE key = 'seats_sync_url';
  IF v_url IS NULL OR v_url = '' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'http_post' AND pronamespace = 'extensions'::regnamespace
  ) THEN
    PERFORM extensions.net.http_post(
      url := v_url,
      body := jsonb_build_object('workspace_id', v_workspace_id::text),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS seats_sync_on_member_change ON workspace_members;
CREATE TRIGGER seats_sync_on_member_change
  AFTER INSERT OR DELETE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION notify_seat_sync();

-- ─── 9. Explicit privileges ────────────────────────────────────────────────
-- Edge functions (stripe-webhook, sync-seats, stripe-checkout) talk to these
-- tables through PostgREST as service_role, and the frontend reads
-- subscriptions as authenticated. Functions above are SECURITY DEFINER, but
-- the direct PostgREST queries still need table-level grants — required on
-- projects where the always-revoked (no auto-expose) behaviour is active.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.workspaces TO service_role;
GRANT SELECT ON public.workspace_members TO service_role;
GRANT SELECT ON public.profiles TO service_role;

GRANT EXECUTE ON FUNCTION public.upsert_subscription(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.effective_plan(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_plan_account(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_effective_plan_account() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_pro_trial_used() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_pro_trial_used(UUID) TO service_role;
