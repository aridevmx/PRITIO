-- PRIO V1 — Fix invitations SELECT policy
-- Migration 0009: allow invited users to see their own pending invitations

-- Drop the old policy that only allows workspace admins to SELECT
DROP POLICY IF EXISTS "invitations: select if workspace admin" ON invitations;

-- New policy: workspace admins can see all invitations for their workspace
CREATE POLICY "invitations: select if workspace admin"
  ON invitations FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- New policy: invited user can see their own pending invitations
CREATE POLICY "invitations: select if invited"
  ON invitations FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- SECURITY DEFINER RPC to check if an email has a pending invitation
-- Used by the beta gate before the user signs up (no auth session yet)
CREATE OR REPLACE FUNCTION check_email_has_invitation(p_email TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1 FROM invitations
    WHERE email = p_email AND accepted_at IS NULL
  );
$$;
