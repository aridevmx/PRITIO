-- PRITIO V1 — Kinds, permissions & monthly quotas
-- Migration 0027
--
-- What changes:
--   * task_kind gains 'event'. Family events move from family_agenda_events
--     into tasks (kind='event') so they share the calendar, the upcoming
--     section and the monthly quota.
--   * tasks gains start_date / end_date (active day range, for calendar
--     multi-day rendering) and visibility ('all' | 'assigned').
--   * workspace_members gains member_type (familia: parentesco/relación).
--   * plan_limits: allow_meetings (boolean that blocked ALL meetings on free)
--     is replaced by monthly quotas meetings_per_month / events_per_month
--     (NULL = unlimited).
--   * Quota enforcement counts meetings/events created in the current month.
--   * RLS: in family workspaces, members (role='member') only see tasks
--     assigned to them or with visibility='all'.
--   * New triggers enforce assignment rules (team member → self only; team
--     leader → members only) and family visibility changes.

-- ─── 1. task_kind enum: add 'event' ────────────────────────────────────────

ALTER TABLE public.tasks ALTER COLUMN kind DROP DEFAULT;

ALTER TYPE task_kind RENAME TO task_kind_legacy;

CREATE TYPE task_kind AS ENUM ('task', 'meeting', 'event');

ALTER TABLE public.tasks
  ALTER COLUMN kind TYPE task_kind USING kind::text::task_kind;

ALTER TABLE public.tasks ALTER COLUMN kind SET DEFAULT 'task';

DROP TYPE task_kind_legacy;

-- ─── 2. tasks: day range + visibility ──────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'all'
    CONSTRAINT tasks_visibility_check CHECK (visibility IN ('all', 'assigned'));

CREATE INDEX idx_tasks_workspace_kind_created
  ON public.tasks (workspace_id, kind, created_at);

-- ─── 3. workspace_members: member_type (parentesco, familia) ───────────────

ALTER TABLE public.workspace_members
  ADD COLUMN member_type TEXT
    CONSTRAINT workspace_members_member_type_check CHECK (
      member_type IS NULL OR member_type IN (
        'abuelo', 'abuela', 'mama', 'papa', 'tio', 'tia',
        'cunado', 'cunada', 'primo', 'prima', 'hermano', 'hermana',
        'hijo', 'hija', 'nieto', 'nieta', 'sobrino', 'sobrina',
        'pareja', 'yerno', 'nuera', 'suegro', 'suegra', 'otro'
      )
    );

-- ─── 3b. invitations: parentesco + workspace_members UPDATE policy ─────────
-- Parentesco se captura al invitar y se copia a workspace_members al aceptar.
-- La política UPDATE cubre ajustes propios (recap/notificaciones/grace) y
-- cambios de admin/owner (rol, parentesco).

ALTER TABLE public.invitations
  ADD COLUMN member_type TEXT
    CONSTRAINT invitations_member_type_check CHECK (
      member_type IS NULL OR member_type IN (
        'abuelo', 'abuela', 'mama', 'papa', 'tio', 'tia',
        'cunado', 'cunada', 'primo', 'prima', 'hermano', 'hermana',
        'hijo', 'hija', 'nieto', 'nieta', 'sobrino', 'sobrina',
        'pareja', 'yerno', 'nuera', 'suegro', 'suegra', 'otro'
      )
    );

DROP POLICY IF EXISTS "members: update if self or workspace admin" ON public.workspace_members;
CREATE POLICY "members: update if self or workspace admin"
  ON public.workspace_members FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );

-- ─── 4. plan_limits: monthly quotas replace allow_meetings ─────────────────

ALTER TABLE public.plan_limits
  DROP COLUMN IF EXISTS allow_meetings,
  DROP COLUMN IF EXISTS agenda_event_limit,
  ADD COLUMN meetings_per_month INTEGER,
  ADD COLUMN events_per_month INTEGER;

-- free: personal 5 juntas + 5 eventos; team 5 juntas; family 5 eventos.
-- pro: NULL = ilimitado.
UPDATE public.plan_limits SET
  meetings_per_month = CASE
    WHEN plan = 'free' AND workspace_type IN ('personal', 'team') THEN 5
    WHEN plan = 'free' AND workspace_type = 'family' THEN 0
    ELSE NULL
  END,
  events_per_month = CASE
    WHEN plan = 'free' AND workspace_type IN ('personal', 'family') THEN 5
    WHEN plan = 'free' AND workspace_type = 'team' THEN 0
    ELSE NULL
  END;

-- ─── 5. Migrate family_agenda_events → tasks (kind='event') ────────────────

INSERT INTO public.tasks (
  workspace_id, title, kind, due_date, start_at, end_at,
  description, visibility, created_by, created_at
)
SELECT
  workspace_id, title, 'event'::task_kind, starts_at::date, starts_at,
  starts_at + interval '30 minutes', NULL, 'all', created_by, created_at
FROM public.family_agenda_events;

DROP TABLE public.family_agenda_events;

-- ─── 6. Quota enforcement: monthly meetings/events ─────────────────────────

CREATE OR REPLACE FUNCTION public.assert_workspace_quota()
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
         blocked_day_limit, meetings_per_month, events_per_month
  INTO v_limits
  FROM plan_limits
  WHERE plan = v_plan AND workspace_type = v_workspace_type;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'tasks' THEN
      IF NEW.kind = 'meeting'::task_kind THEN
        v_resource := 'meetings';
        v_limit := v_limits.meetings_per_month;
        SELECT COUNT(*) INTO v_current FROM tasks
        WHERE workspace_id = v_workspace_id AND kind = 'meeting'::task_kind
          AND created_at >= date_trunc('month', now());
      ELSIF NEW.kind = 'event'::task_kind THEN
        v_resource := 'events';
        v_limit := v_limits.events_per_month;
        SELECT COUNT(*) INTO v_current FROM tasks
        WHERE workspace_id = v_workspace_id AND kind = 'event'::task_kind
          AND created_at >= date_trunc('month', now());
      ELSE
        v_resource := 'active_tasks';
        v_limit := v_limits.active_task_limit;
        SELECT COUNT(*) INTO v_current FROM tasks
        WHERE workspace_id = v_workspace_id AND is_active = true
          AND kind NOT IN ('meeting', 'event');
      END IF;
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

  IF v_limit IS NOT NULL AND v_current >= v_limit THEN
    RAISE EXCEPTION 'prio_plan_limit:%', v_resource;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 7. current_usage: monthly meetings/events ─────────────────────────────

CREATE OR REPLACE FUNCTION public.current_usage(p_workspace_id UUID)
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
                     WHERE workspace_id = p_workspace_id AND is_active = true
                       AND kind NOT IN ('meeting', 'event')),
    'projects', (SELECT COUNT(*) FROM projects WHERE workspace_id = p_workspace_id),
    'assignees', (SELECT COUNT(*) FROM assignees WHERE workspace_id = p_workspace_id),
    'blocked_days', (SELECT COUNT(*) FROM user_blocked_days
                     WHERE workspace_id = p_workspace_id AND blocked_date >= CURRENT_DATE AND status <> 'rejected'),
    'meetings_this_month', (SELECT COUNT(*) FROM tasks
                            WHERE workspace_id = p_workspace_id AND kind = 'meeting'::task_kind
                              AND created_at >= date_trunc('month', now())),
    'events_this_month', (SELECT COUNT(*) FROM tasks
                          WHERE workspace_id = p_workspace_id AND kind = 'event'::task_kind
                            AND created_at >= date_trunc('month', now())),
    'plan', effective_plan(p_workspace_id),
    'trial_ends_at', (SELECT trial_ends_at FROM subscriptions
                      WHERE workspace_id = p_workspace_id AND plan = 'pro' AND status = 'trialing'
                      ORDER BY COALESCE(current_period_end, now()) DESC LIMIT 1)
  ) INTO v_usage;

  RETURN v_usage;
END;
$$;

-- ─── 8. Family member visibility (RLS on tasks) ────────────────────────────

CREATE OR REPLACE FUNCTION public.is_family_member_restricted(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
      AND w.type = 'family'::workspace_type
      AND wm.role = 'member'::workspace_role
  );
$$;

CREATE OR REPLACE FUNCTION public.task_is_assigned_to_user(p_task_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_assignees ta
    JOIN public.assignees a ON a.id = ta.assignee_id
    WHERE ta.task_id = p_task_id
      AND a.linked_user_id = p_user_id
  );
$$;

DROP POLICY IF EXISTS "tasks: select if workspace member" ON public.tasks;
CREATE POLICY "tasks: select if workspace member"
  ON public.tasks FOR SELECT
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      NOT public.is_family_member_restricted(workspace_id, auth.uid())
      OR visibility = 'all'
      OR public.task_is_assigned_to_user(id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "tasks: update if workspace member" ON public.tasks;
CREATE POLICY "tasks: update if workspace member"
  ON public.tasks FOR UPDATE
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      NOT public.is_family_member_restricted(workspace_id, auth.uid())
      OR visibility = 'all'
      OR public.task_is_assigned_to_user(id, auth.uid())
    )
  );

-- ─── 9. Assignment + visibility rules ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_assign_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_ws_id UUID;
  v_ws_type workspace_type;
  v_role workspace_role;
  v_linked UUID;
  v_target_role workspace_role;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.workspace_id, w.type, wm.role
    INTO v_ws_id, v_ws_type, v_role
  FROM public.tasks t
  JOIN public.workspaces w ON w.id = t.workspace_id
  JOIN public.workspace_members wm ON wm.workspace_id = t.workspace_id AND wm.user_id = v_uid
  WHERE t.id = NEW.task_id;

  IF v_ws_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_ws_type = 'personal'::workspace_type
     OR v_role IN ('owner'::workspace_role, 'admin'::workspace_role) THEN
    RETURN NEW;
  END IF;

  SELECT linked_user_id INTO v_linked FROM public.assignees WHERE id = NEW.assignee_id;

  IF v_role = 'member'::workspace_role THEN
    IF v_linked IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'prio_plan_limit:permission';
    END IF;
    RETURN NEW;
  END IF;

  -- v_role = 'leader'
  IF v_ws_type = 'family'::workspace_type THEN
    RETURN NEW;
  END IF;

  IF v_linked IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT wm.role INTO v_target_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = v_ws_id AND wm.user_id = v_linked;

  IF v_target_role IS NULL
     OR v_target_role IN ('owner'::workspace_role, 'admin'::workspace_role, 'leader'::workspace_role) THEN
    RAISE EXCEPTION 'prio_plan_limit:permission';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_permission ON public.task_assignees;
CREATE TRIGGER assign_permission
  BEFORE INSERT ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.assert_assign_permission();

CREATE OR REPLACE FUNCTION public.assert_visibility_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_ws_type workspace_type;
  v_role workspace_role;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.type, wm.role INTO v_ws_type, v_role
  FROM public.workspaces w
  JOIN public.workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = v_uid
  WHERE w.id = NEW.workspace_id;

  IF v_ws_type = 'family'::workspace_type AND v_role = 'member'::workspace_role THEN
    IF TG_OP = 'UPDATE' AND NEW.visibility = 'all'::text THEN
      RAISE EXCEPTION 'prio_plan_limit:permission';
    END IF;
    IF TG_OP = 'INSERT' THEN
      NEW.visibility := 'assigned';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visibility_permission ON public.tasks;
CREATE TRIGGER visibility_permission
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.assert_visibility_permission();

-- ─── 9b. Projects: update/delete policies (missing since 0002/0006) ────────
-- INSERT/UPDATE/DELETE de projects se abre a cualquier miembro del workspace,
-- igual que la política INSERT existente y el botón "Gestionar" del panel.

DROP POLICY IF EXISTS "projects: update if workspace member" ON public.projects;
CREATE POLICY "projects: update if workspace member"
  ON public.projects FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "projects: delete if workspace member" ON public.projects;
CREATE POLICY "projects: delete if workspace member"
  ON public.projects FOR DELETE
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- ─── 10. Explicit privileges (least privilege, matches 0026) ───────────────

REVOKE EXECUTE ON FUNCTION public.is_family_member_restricted(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.task_is_assigned_to_user(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_family_member_restricted(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_is_assigned_to_user(UUID, UUID) TO authenticated;
