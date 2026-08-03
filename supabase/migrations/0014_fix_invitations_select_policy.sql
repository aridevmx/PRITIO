-- Fix invitations SELECT policy for invited users.
--
-- The previous policy (migration 0009) read auth.users directly:
--   USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
-- Neither the anon nor the authenticated role has SELECT on auth.users,
-- so every GET / POST on /rest/v1/invitations failed with:
--   permission denied for table users (42501)
-- (POST failed on the RETURNING/SELECT of the inserted row.)
--
-- Use the JWT email claim instead, which is readable by anon/authenticated.

DROP POLICY IF EXISTS "invitations: select if invited" ON public.invitations;

CREATE POLICY "invitations: select if invited"
  ON public.invitations FOR SELECT
  USING (email = (SELECT (auth.jwt() ->> 'email')::text));
