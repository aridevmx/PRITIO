-- PRIO V1 — Workspace blocked days RPC
-- Migration 0013: lets workspace members see who blocked which day in the calendar.
-- SECURITY DEFINER bypasses RLS on user_blocked_days/profiles, but only returns rows
-- for workspaces the caller belongs to.

CREATE OR REPLACE FUNCTION public.list_workspace_blocked_days(
  p_workspace_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (blocked_date date, user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ubd.blocked_date, ubd.user_id, COALESCE(p.full_name, 'Usuario')
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
