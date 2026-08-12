-- PRITIO V1 — Plan features + per-workspace limits (plan_limits v2)
-- Migration 0025
--
-- What changes:
--   * family_agenda_events: a new calendar feature for family workspaces
--     (Family Free 10 / Family Pro 100 events; quota-enforced server-side).
--   * plan_limits gains feature flags and the approved limit table:
--       members / active tasks / agenda events / projects / assignees /
--       blocked days / workspace limit (1 per type) + allow_plan_view,
--       allow_board_view, allow_meetings, allow_due_date, support_tier.
--   * 'enterprise' is removed: existing workspaces migrate to 'team' and the
--     enum value is dropped.
--   * effective_plan() resolves per workspace_id (no user filter) so every
--     member of a Pro workspace gets Pro limits; a trialing subscription only
--     counts while trial_ends_at > now().
--   * Meetings: blocked on Free plans (RAISE prio_plan_limit:meetings) and,
--     when allowed, do NOT count against the active-task limit.
--   * start_pro_trial(workspace_id): 14-day per-workspace Pro trial for
--     family/team workspaces (owner/admin). The old one-time-per-account trial
--     (profiles.pro_trial_used_at) is kept but no longer used.
--   * current_usage() returns the effective plan, trial_ends_at and
--     agenda_events so the client can render feature flags.

-- ─── 1. Family agenda events ──────────────────────────────────────────────

CREATE TABLE family_agenda_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE family_agenda_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_events: select if workspace member"
  ON family_agenda_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agenda_events: insert if workspace member"
  ON family_agenda_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agenda_events: update if workspace member"
  ON family_agenda_events FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "agenda_events: delete if workspace member"
  ON family_agenda_events FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE INDEX idx_family_agenda_events_workspace_start
  ON family_agenda_events (workspace_id, starts_at);

-- ─── 2. plan_limits: new feature columns + approved limit table ───────────

ALTER TABLE plan_limits
  ADD COLUMN agenda_event_limit INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN allow_plan_view BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN allow_board_view BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN allow_meetings BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN allow_due_date BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN support_tier TEXT NOT NULL DEFAULT 'mail';

DELETE FROM plan_limits;

INSERT INTO plan_limits (
  plan, workspace_type, member_limit, active_task_limit, project_limit,
  assignee_limit, blocked_day_limit, workspace_limit, agenda_event_limit,
  allow_plan_view, allow_board_view, allow_meetings, allow_due_date, support_tier
) VALUES
  ('free', 'personal', 1,   50,    3,    0,    10,  1, 0,   false, false, false, false, 'mail'),
  ('pro',  'personal', 1,   300,   100,  0,    30,  1, 0,   true,  true,  true,  true,  'mail+chat'),
  ('free', 'family',   4,   50,    5,    5,    10,  1, 10,  false, false, false, false, 'mail'),
  ('pro',  'family',   10,  300,   100,  50,   30,  1, 100, true,  true,  true,  true,  'email+chat'),
  ('free', 'team',     5,   100,   5,    10,   10,  1, 0,   false, false, false, false, 'mail'),
  ('pro',  'team',     50,  5000,  500,  500,  90,  1, 0,   true,  true,  true,  true,  'chat+mail+phone')
ON CONFLICT (plan, workspace_type) DO NOTHING;

-- ─── 3. Drop 'enterprise' ─────────────────────────────────────────────────
-- PostgreSQL has no ALTER TYPE ... DROP VALUE (syntax error); the supported
-- pattern is rename-and-replace. Existing 'enterprise' workspaces move to
-- 'team' first, then the enum is recreated without the value.

UPDATE workspaces SET type = 'team'::workspace_type WHERE type = 'enterprise'::workspace_type;

ALTER TYPE workspace_type RENAME TO workspace_type_legacy;

CREATE TYPE workspace_type AS ENUM ('personal', 'family', 'team');

ALTER TABLE workspaces
  ALTER COLUMN type DROP DEFAULT,
  ALTER COLUMN type TYPE workspace_type USING type::text::workspace_type,
  ALTER COLUMN type SET DEFAULT 'personal'::workspace_type;

ALTER TABLE plan_limits
  ALTER COLUMN workspace_type TYPE workspace_type USING workspace_type::text::workspace_type;

DROP TYPE workspace_type_legacy;

-- ─── 4. Workspace creation: per-type owner count (1 workspace of each type) ─

CREATE OR REPLACE FUNCTION create_workspace(p_name TEXT, p_type TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_result JSONB;
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

    -- Free limit drives creation: the new workspace starts Free and
    -- workspace_limit is 1 for every plan row (1 workspace per type).
    SELECT workspace_limit INTO v_ws_limit
    FROM plan_limits
    WHERE plan = 'free' AND workspace_type = v_ws_type;

    SELECT COUNT(*) INTO v_ws_count
    FROM workspaces w
    JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = p_user_id AND m.role = 'owner' AND w.type = v_ws_type;

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

CREATE OR REPLACE FUNCTION assert_account_workspace_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator UUID;
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

  SELECT workspace_limit INTO v_limit
  FROM plan_limits
  WHERE plan = 'free' AND workspace_type = v_workspace_type;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM workspaces w
  JOIN workspace_members m ON m.workspace_id = w.id
  WHERE m.user_id = v_creator AND m.role = 'owner' AND w.type = v_workspace_type;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'prio_plan_limit:workspaces';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 5. Per-workspace plan resolution (incl. active trial) ────────────────

DROP FUNCTION IF EXISTS effective_plan(UUID, UUID);

CREATE OR REPLACE FUNCTION effective_plan(p_workspace_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_plan TEXT;
  v_status TEXT;
  v_trial_ends_at TIMESTAMPTZ;
BEGIN
  SELECT plan, status, trial_ends_at INTO v_plan, v_status, v_trial_ends_at
  FROM subscriptions
  WHERE workspace_id = p_workspace_id
    AND plan = 'pro' AND status IN ('active', 'trialing', 'past_due')
  ORDER BY COALESCE(current_period_end, now()) DESC
  LIMIT 1;

  IF v_plan IS NULL THEN
    RETURN 'free';
  END IF;

  IF v_status = 'trialing' AND v_trial_ends_at IS NOT NULL AND v_trial_ends_at <= now() THEN
    RETURN 'free';
  END IF;

  RETURN v_plan;
END;
$$;

-- ─── 6. Quota enforcement: meetings + agenda events ───────────────────────

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

  v_plan := effective_plan(v_workspace_id);

  SELECT member_limit, active_task_limit, project_limit, assignee_limit,
         blocked_day_limit, agenda_event_limit, allow_meetings
  INTO v_limits
  FROM plan_limits
  WHERE plan = v_plan AND workspace_type = v_workspace_type;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'tasks' THEN
      IF NEW.kind = 'meeting'::task_kind THEN
        IF NOT v_limits.allow_meetings THEN
          RAISE EXCEPTION 'prio_plan_limit:meetings';
        END IF;
        RETURN NEW;
      END IF;
      v_resource := 'active_tasks';
      v_limit := v_limits.active_task_limit;
      SELECT COUNT(*) INTO v_current FROM tasks
      WHERE workspace_id = v_workspace_id AND is_active = true AND kind <> 'meeting';
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
    WHEN 'family_agenda_events' THEN
      v_resource := 'agenda_events';
      v_limit := v_limits.agenda_event_limit;
      SELECT COUNT(*) INTO v_current FROM family_agenda_events
      WHERE workspace_id = v_workspace_id;
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

DROP TRIGGER IF EXISTS quota_agenda_events ON family_agenda_events;
CREATE TRIGGER quota_agenda_events
  BEFORE INSERT ON family_agenda_events
  FOR EACH ROW EXECUTE FUNCTION assert_workspace_quota();

-- ─── 7. current_usage: plan, trial and agenda events ──────────────────────

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
    'active_tasks', (SELECT COUNT(*) FROM tasks
                     WHERE workspace_id = p_workspace_id AND is_active = true AND kind <> 'meeting'),
    'projects', (SELECT COUNT(*) FROM projects WHERE workspace_id = p_workspace_id),
    'assignees', (SELECT COUNT(*) FROM assignees WHERE workspace_id = p_workspace_id),
    'blocked_days', (SELECT COUNT(*) FROM user_blocked_days
                     WHERE workspace_id = p_workspace_id AND blocked_date >= CURRENT_DATE AND status <> 'rejected'),
    'agenda_events', (SELECT COUNT(*) FROM family_agenda_events WHERE workspace_id = p_workspace_id),
    'plan', effective_plan(p_workspace_id),
    'trial_ends_at', (SELECT trial_ends_at FROM subscriptions
                      WHERE workspace_id = p_workspace_id AND plan = 'pro' AND status = 'trialing'
                      ORDER BY COALESCE(current_period_end, now()) DESC LIMIT 1)
  ) INTO v_usage;

  RETURN v_usage;
END;
$$;

-- ─── 8. Per-workspace Pro trial ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION start_pro_trial(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws_type workspace_type;
  v_role workspace_role;
  v_row subscriptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT role INTO v_role FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = auth.uid();

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'prio_plan_limit:permission';
  END IF;

  SELECT type INTO v_ws_type FROM workspaces WHERE id = p_workspace_id;
  IF v_ws_type IS NULL THEN
    RAISE EXCEPTION 'workspace not found';
  END IF;

  IF v_ws_type NOT IN ('family', 'team') THEN
    RAISE EXCEPTION 'prio_plan_limit:workspaces';
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscriptions
    WHERE workspace_id = p_workspace_id AND plan = 'pro'
      AND status IN ('active', 'trialing', 'past_due')
  ) THEN
    RAISE EXCEPTION 'prio_plan_limit:already_pro';
  END IF;

  INSERT INTO subscriptions (
    user_id, workspace_id, plan, status, current_period_end,
    quantity, trial_ends_at
  )
  VALUES (
    auth.uid(), p_workspace_id, 'pro', 'trialing', NULL,
    1, now() + interval '14 days'
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'workspace_id', v_row.workspace_id,
    'plan', v_row.plan,
    'status', v_row.status,
    'trial_ends_at', v_row.trial_ends_at,
    'quantity', v_row.quantity
  );
END;
$$;

-- ─── 9. Explicit privileges ───────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_agenda_events TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.effective_plan(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_pro_trial(UUID) TO authenticated;
