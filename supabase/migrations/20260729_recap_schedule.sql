-- Add recap schedule columns to workspace_members
-- These allow users to configure daily recap notifications per workspace

ALTER TABLE workspace_members
ADD COLUMN IF NOT EXISTS recap_morning_at time,
ADD COLUMN IF NOT EXISTS recap_evening_at time,
ADD COLUMN IF NOT EXISTS recap_timezone text NOT NULL DEFAULT 'America/Mexico_City',
ADD COLUMN IF NOT EXISTS approval_grace_seconds integer NOT NULL DEFAULT 0;
