-- PRITIO V1 — Blocked days approval
-- Migration 0020: blocked days requested by members require manager approval.
-- - Adds status/decided_by/decided_at/rejection_reason to user_blocked_days.
-- - list_workspace_blocked_days now returns `status` (clients filter approved/pending).
-- - New manager-only RPCs: list_pending_blocked_days, approve_blocked_day, reject_blocked_day.

-- ─── Columns ─────────────────────────────────────────────

ALTER TABLE user_blocked_days
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_blocked_days_status_check'
  ) THEN
    ALTER TABLE user_blocked_days
      ADD CONSTRAINT user_blocked_days_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blocked_days_workspace_status
  ON user_blocked_days(workspace_id, status);

-- ─── list_workspace_blocked_days (with status, hides rejected) ─

DROP FUNCTION IF EXISTS public.list_workspace_blocked_days(uuid, date, date);

CREATE OR REPLACE FUNCTION public.list_workspace_blocked_days(
  p_workspace_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (blocked_date date, user_id uuid, full_name text, reason text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ubd.blocked_date, ubd.user_id, COALESCE(p.full_name, 'Usuario'), ubd.reason, ubd.status
  FROM user_blocked_days ubd
  JOIN profiles p ON p.id = ubd.user_id
  WHERE ubd.workspace_id = p_workspace_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.user_id = auth.uid()
    )
    AND (p_from IS NULL OR ubd.blocked_date >= p_from)
    AND (p_to IS NULL OR ubd.blocked_date <= p_to)
  ORDER BY ubd.blocked_date
$$;

REVOKE ALL ON FUNCTION public.list_workspace_blocked_days(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_workspace_blocked_days(uuid, date, date) TO authenticated;

-- ─── list_pending_blocked_days (managers only) ─────────────

CREATE OR REPLACE FUNCTION public.list_pending_blocked_days(p_workspace_id uuid)
RETURNS TABLE (blocked_date date, user_id uuid, full_name text, reason text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ubd.blocked_date, ubd.user_id, COALESCE(p.full_name, 'Usuario'), ubd.reason, ubd.created_at
  FROM user_blocked_days ubd
  JOIN profiles p ON p.id = ubd.user_id
  WHERE ubd.workspace_id = p_workspace_id
    AND ubd.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'leader')
    )
  ORDER BY ubd.created_at
$$;

REVOKE ALL ON FUNCTION public.list_pending_blocked_days(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_blocked_days(uuid) TO authenticated;

-- ─── approve_blocked_day ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_blocked_day(
  p_workspace_id uuid,
  p_user_id uuid,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin', 'leader')
  ) THEN
    RAISE EXCEPTION 'No tienes permisos para aprobar días bloqueados';
  END IF;

  UPDATE user_blocked_days
  SET status = 'approved', decided_by = auth.uid(), decided_at = now(), rejection_reason = NULL
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND blocked_date = p_date;

  INSERT INTO notifications (user_id, kind, title, body, workspace_id)
  VALUES (
    p_user_id,
    'blocked_day_approved',
    'Día bloqueado aprobado',
    format('Tu día del %s fue aprobado.', to_char(p_date, 'DD/MM/YYYY')),
    p_workspace_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_blocked_day(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_blocked_day(uuid, uuid, date) TO authenticated;

-- ─── reject_blocked_day ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_blocked_day(
  p_workspace_id uuid,
  p_user_id uuid,
  p_date date,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin', 'leader')
  ) THEN
    RAISE EXCEPTION 'No tienes permisos para rechazar días bloqueados';
  END IF;

  UPDATE user_blocked_days
  SET status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      rejection_reason = COALESCE(NULLIF(p_reason, ''), 'Sin motivo')
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND blocked_date = p_date;

  INSERT INTO notifications (user_id, kind, title, body, workspace_id)
  VALUES (
    p_user_id,
    'blocked_day_rejected',
    'Día bloqueado rechazado',
    format('Tu día del %s fue rechazado: %s', to_char(p_date, 'DD/MM/YYYY'), COALESCE(NULLIF(p_reason, ''), 'Sin motivo')),
    p_workspace_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_blocked_day(uuid, uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_blocked_day(uuid, uuid, date, text) TO authenticated;
