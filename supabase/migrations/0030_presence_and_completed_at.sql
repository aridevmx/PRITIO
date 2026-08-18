-- Migration 0030: presence (online status) + completed_at consistency
-- 1. profiles.presence_updated_at  -> last-seen heartbeat for online avatars
-- 2. tasks.completed_at            -> kept in sync by trigger regardless of caller
-- 3. list_workspace_member_presence -> RPC (SECURITY DEFINER) for member presence

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS presence_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_presence ON profiles (presence_updated_at);

CREATE OR REPLACE FUNCTION sync_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed IS DISTINCT FROM OLD.completed THEN
    IF NEW.completed THEN
      NEW.completed_at := now();
    ELSE
      NEW.completed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_task_completed_at ON tasks;
CREATE TRIGGER trg_sync_task_completed_at
  BEFORE UPDATE OF completed ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_completed_at();

CREATE OR REPLACE FUNCTION list_workspace_member_presence(p_workspace_id UUID)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  presence_updated_at TIMESTAMPTZ,
  is_online BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(p.full_name, 'Usuario') AS full_name,
    p.avatar_url,
    p.presence_updated_at,
    (p.presence_updated_at IS NOT NULL AND p.presence_updated_at >= now() - interval '2 minutes') AS is_online
  FROM workspace_members wm
  JOIN profiles p ON p.id = wm.user_id
  WHERE wm.workspace_id = p_workspace_id
  ORDER BY is_online DESC, COALESCE(p.full_name, 'Usuario') ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_workspace_member_presence(UUID) TO authenticated;
