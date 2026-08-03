-- PRIO V1 — User Blocked Days
-- Migration 0007: user_blocked_days table for marking unavailable days

CREATE TABLE user_blocked_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, workspace_id, blocked_date)
);

ALTER TABLE user_blocked_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_days: select own"
  ON user_blocked_days FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "blocked_days: insert own"
  ON user_blocked_days FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "blocked_days: delete own"
  ON user_blocked_days FOR DELETE
  USING (user_id = auth.uid());

CREATE INDEX idx_blocked_days_user_date ON user_blocked_days(user_id, blocked_date);
CREATE INDEX idx_blocked_days_workspace ON user_blocked_days(workspace_id);
