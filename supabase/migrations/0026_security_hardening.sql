-- PRITIO V1 — Security hardening (pre-GitHub audit)
-- Migration 0026
--
-- Fixes found during the security audit:
--   * workspace_members INSERT policy allowed any authenticated user to
--     insert themselves into ANY workspace with ANY role (cross-tenant).
--   * workspaces INSERT policy let any authenticated user create workspace
--     rows via direct PostgREST insert; creation is now SECURITY DEFINER only.
--   * invitations UPDATE policy had no WITH CHECK, so an invitee could mutate
--     role / email / workspace_id of their invitation.
--   * create_workspace() / create_personal_workspace() (SECURITY DEFINER) did
--     not validate p_user_id against auth.uid() and were PUBLIC.
--   * effective_plan() / effective_plan_account() were PUBLIC plan oracles
--     without any membership / ownership check.
--   * Several SECURITY DEFINER functions lacked SET search_path.
--   * The seat re-sync trigger called sync-seats without authentication.
--   * Most RPCs kept the default EXECUTE PUBLIC grant.

-- ─── 1. workspace_members INSERT: no more self-insert anywhere ─────────────
-- Old policy: WITH CHECK (user_id = auth.uid() OR is_workspace_admin(...)).
-- An authenticated user could add themselves to ANY workspace as owner.
-- New policy: only existing workspace admins may add NON-owner members, or a
-- user whose email holds a pending, already-accepted invitation (the invite
-- acceptance flow in the client). Owner rows are created exclusively through
-- the SECURITY DEFINER workspace-creation functions.

DROP POLICY IF EXISTS "members: insert if workspace admin" ON public.workspace_members;

CREATE POLICY "members: insert if workspace admin"
  ON public.workspace_members FOR INSERT
  WITH CHECK (
    (
      is_workspace_admin(workspace_id, auth.uid())
      AND role IS DISTINCT FROM 'owner'::workspace_role
    )
    OR (
      user_id = auth.uid()
      AND role IS DISTINCT FROM 'owner'::workspace_role
      AND EXISTS (
        SELECT 1 FROM public.invitations i
        WHERE i.workspace_id = workspace_id
          AND i.email = (SELECT email FROM public.profiles WHERE id = auth.uid())
          AND i.accepted_at IS NOT NULL
          AND i.role = role
      )
    )
  );

-- ─── 2. workspaces INSERT: creation only via SECURITY DEFINER RPC ──────────
-- The client no longer inserts workspace rows directly; create_workspace() and
-- create_personal_workspace() bypass RLS as SECURITY DEFINER. Removing the
-- permissive insert policy prevents orphan/rogue workspace rows.

DROP POLICY IF EXISTS "workspaces: insert if authenticated" ON public.workspaces;

-- ─── 3. invitations UPDATE: invitee can only accept, nothing else ─────────
-- The invitee path must keep email/workspace_id/role/invited_by unchanged and
-- may only set accepted_at from NULL to a value. Admins keep full control.
-- Row identity is read through a SECURITY DEFINER helper so the policy never
-- re-enters RLS on the same table (would raise 42P17, see migration 0006).

CREATE OR REPLACE FUNCTION public.invitation_original(p_invitation_id UUID)
RETURNS invitations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT i
  FROM public.invitations i
  WHERE i.id = p_invitation_id
$$;

DROP POLICY IF EXISTS "invitations: update if invited" ON public.invitations;

CREATE POLICY "invitations: update if invited"
  ON public.invitations FOR UPDATE
  USING (
    email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    OR is_workspace_admin(workspace_id, auth.uid())
  )
  WITH CHECK (
    is_workspace_admin(workspace_id, auth.uid())
    OR (
      email = (SELECT email FROM public.profiles WHERE id = auth.uid())
      AND (invitation_original(id)).workspace_id = workspace_id
      AND (invitation_original(id)).role = role
      AND (invitation_original(id)).invited_by = invited_by
      AND (
        accepted_at IS NULL
        OR (invitation_original(id)).accepted_at IS NULL
      )
    )
  );

-- ─── 4. Workspace-creation guards: p_user_id must be the caller ────────────

CREATE OR REPLACE FUNCTION public.create_workspace(p_name TEXT, p_type TEXT, p_user_id UUID)
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
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'prio_plan_limit:permission';
  END IF;

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

CREATE OR REPLACE FUNCTION public.create_personal_workspace(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'prio_plan_limit:permission';
  END IF;

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

-- ─── 5. Plan oracles: require membership / self ────────────────────────────

CREATE OR REPLACE FUNCTION public.effective_plan(p_workspace_id UUID)
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
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RETURN 'free';
  END IF;

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

CREATE OR REPLACE FUNCTION public.effective_plan_account(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_plan TEXT;
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RETURN NULL;
  END IF;

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

-- ─── 6. Missing SET search_path on SECURITY DEFINER functions ──────────────

CREATE OR REPLACE FUNCTION public.check_email_has_invitation(p_email TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE sql
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invitations
    WHERE email = p_email AND accepted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.create_next_recurrence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interval INT;
  v_next_due DATE;
  v_next_start TIMESTAMPTZ;
  v_next_end TIMESTAMPTZ;
  v_next_id UUID;
  v_count INT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NOT (OLD.completed IS TRUE) AND (NEW.completed IS TRUE)
     AND NEW.recurrence_freq IS NOT NULL THEN

    v_interval := GREATEST(COALESCE(NEW.recurrence_interval, 1), 1);

    IF NEW.due_date IS NOT NULL THEN
      v_next_due := CASE NEW.recurrence_freq
        WHEN 'daily'   THEN NEW.due_date + v_interval
        WHEN 'weekly'  THEN NEW.due_date + (7 * v_interval)
        WHEN 'monthly' THEN NEW.due_date + make_interval(months => v_interval)
      END;
    END IF;

    IF NEW.start_at IS NOT NULL THEN
      IF NEW.due_date IS NOT NULL AND v_next_due IS NOT NULL THEN
        v_next_start := NEW.start_at + (v_next_due - NEW.due_date);
      ELSE
        v_next_start := CASE NEW.recurrence_freq
          WHEN 'daily'   THEN NEW.start_at + make_interval(days => v_interval)
          WHEN 'weekly'  THEN NEW.start_at + make_interval(days => 7 * v_interval)
          WHEN 'monthly' THEN NEW.start_at + make_interval(months => v_interval)
        END;
      END IF;
      IF NEW.end_at IS NOT NULL THEN
        IF NEW.due_date IS NOT NULL AND v_next_due IS NOT NULL THEN
          v_next_end := NEW.end_at + (v_next_due - NEW.due_date);
        ELSE
          v_next_end := NEW.end_at + (v_next_start - NEW.start_at);
        END IF;
      END IF;
    END IF;

    IF NEW.recurrence_end_date IS NOT NULL AND v_next_due IS NOT NULL
       AND v_next_due > NEW.recurrence_end_date THEN
      RETURN NEW;
    END IF;

    IF NEW.recurrence_count IS NOT NULL AND NEW.recurrence_count <= 1 THEN
      RETURN NEW;
    END IF;

    v_count := CASE WHEN NEW.recurrence_count IS NULL THEN NULL
                    ELSE NEW.recurrence_count - 1 END;

    v_next_id := gen_random_uuid();

    INSERT INTO tasks (
      id, workspace_id, project_id, title, description, quadrant, kind,
      due_date, start_at, end_at, location, meeting_link,
      completed, completed_at, requires_approval, approved, rejected, rejection_reason,
      responsible_assignee_id, is_active, created_by, approval_requested_at,
      recurrence_freq, recurrence_interval, recurrence_end_date, recurrence_count, recurrence_parent_id
    ) VALUES (
      v_next_id, NEW.workspace_id, NEW.project_id, NEW.title, NEW.description, NEW.quadrant, NEW.kind,
      v_next_due, v_next_start, v_next_end, NEW.location, NEW.meeting_link,
      false, NULL, NEW.requires_approval, NEW.approved, NEW.rejected, NEW.rejection_reason,
      NEW.responsible_assignee_id, true, NEW.created_by,
      CASE WHEN NEW.requires_approval THEN now() ELSE NULL END,
      NEW.recurrence_freq, NEW.recurrence_interval, NEW.recurrence_end_date, v_count, NEW.id
    );

    INSERT INTO task_assignees (task_id, assignee_id, is_primary)
      SELECT v_next_id, assignee_id, is_primary
      FROM task_assignees
      WHERE task_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 7. Seat re-sync: shared secret header (fail-closed) ───────────────────
-- sync-seats is unauthenticated by design (pg_net has no JWT); it now requires
-- an Authorization: Bearer <token> header. The token lives in app_settings so
-- it is not baked into the migration. Empty value = sync disabled.

INSERT INTO app_settings (key, value)
VALUES ('seats_sync_token', '')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_seat_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_url TEXT;
  v_token TEXT;
  v_headers JSONB;
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

  SELECT value INTO v_token FROM app_settings WHERE key = 'seats_sync_token';
  IF v_token IS NULL OR v_token = '' THEN
    RETURN NULL;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_token
  );

  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'http_post' AND pronamespace = 'extensions'::regnamespace
  ) THEN
    PERFORM extensions.net.http_post(
      url := v_url,
      body := jsonb_build_object('workspace_id', v_workspace_id::text),
      headers := v_headers
    );
  END IF;

  RETURN NULL;
END;
$$;

-- ─── 8. Explicit privileges: drop PUBLIC, grant by role ────────────────────

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_workspace_admin(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_personal_workspace(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.effective_plan(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.effective_plan_account(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_effective_plan_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_pro_trial_used() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_subscriptions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_usage(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_pro_trial(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_workspace_member(UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_pro_trial_used(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_subscription(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TIMESTAMPTZ, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_personal_workspace(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.effective_plan(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_plan_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_effective_plan_account() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_pro_trial_used() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_usage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_pro_trial(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(UUID, UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_pro_trial_used(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_subscription(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, INTEGER, TIMESTAMPTZ, TEXT) TO service_role;

-- check_email_has_invitation stays PUBLIC on purpose: the beta gate runs it
-- with only the anon key, before the user has a session.
GRANT EXECUTE ON FUNCTION public.check_email_has_invitation(TEXT) TO anon, authenticated;
