-- Create user_filters table for custom Gmail-like filters
CREATE TABLE IF NOT EXISTS user_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_filters ENABLE ROW LEVEL SECURITY;

-- Users can manage their own filters
CREATE POLICY "Users manage own filters" ON user_filters
  FOR ALL USING (auth.uid() = user_id);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_filters_user_id ON user_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_filters_workspace_id ON user_filters(workspace_id);