-- PRITIO V1 — Blocked days reason
-- Migration 0017: include the `reason` (and its user) when listing workspace
-- blocked days so the calendar can show why a day is unavailable.
-- Replaces the function from migration 0013. CREATE OR REPLACE cannot change
-- the return type, so drop the old signature first.

DROP FUNCTION IF EXISTS public.list_workspace_blocked_days(uuid, date, date);

CREATE OR REPLACE FUNCTION public.list_workspace_blocked_days(
  p_workspace_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (blocked_date date, user_id uuid, full_name text, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ubd.blocked_date, ubd.user_id, COALESCE(p.full_name, 'Usuario'), ubd.reason
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
