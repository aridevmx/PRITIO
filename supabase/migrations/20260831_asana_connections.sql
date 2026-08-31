-- Asana connection: stores OAuth tokens per user.
-- Tokens are stored server-side only (never exposed to the client).
CREATE TABLE IF NOT EXISTS asana_connections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asana_user_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at   timestamptz NOT NULL,
  scope        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One connection per user (they can reconnect if needed).
CREATE UNIQUE INDEX IF NOT EXISTS asana_connections_user_id_idx ON asana_connections(user_id);

ALTER TABLE asana_connections ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own connection.
CREATE POLICY "asana_connections_select_own"
  ON asana_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "asana_connections_insert_own"
  ON asana_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "asana_connections_update_own"
  ON asana_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "asana_connections_delete_own"
  ON asana_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Track the source of imported tasks for dedup.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text;

-- Allow the service-role to upsert by (external_source, external_id) for dedup.
CREATE INDEX IF NOT EXISTS tasks_external_idx
  ON tasks(external_source, external_id)
  WHERE external_source IS NOT NULL;
