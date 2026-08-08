-- PRITIO V1 — Member removal (quitar miembro)
-- Migration 0022
--
-- 1. DELETE policy on workspace_members: admins/owner can remove anyone,
--    and any member can remove themselves (leave).
-- 2. remove_workspace_member(): atomic removal that optionally reassigns the
--    removed member's tasks to another responsable, keeps the responsable as
--    inactive (unlinked) so history is preserved, and removes the membership.

-- ─── 1. DELETE policy for workspace_members ────────────────────────────────

DROP POLICY IF EXISTS "members: delete if self or workspace admin" ON public.workspace_members;
CREATE POLICY "members: delete if self or workspace admin"
  ON public.workspace_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_workspace_admin(workspace_id, auth.uid())
  );

-- ─── 2. remove_workspace_member RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_workspace_member(
  p_workspace_id UUID,
  p_user_id UUID,
  p_reassign_assignee_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_target_role TEXT;
  v_removed_assignee UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Only workspace admins/owners can remove others; members can remove themselves.
  IF NOT (is_workspace_admin(p_workspace_id, v_caller) OR v_caller = p_user_id) THEN
    RAISE EXCEPTION 'No tienes permisos para quitar miembros de este workspace';
  END IF;

  SELECT role INTO v_target_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;

  IF v_target_role IS NULL THEN
    RETURN; -- nothing to remove
  END IF;

  -- The owner cannot be removed (unless it is the owner leaving; owners are
  -- expected to delete the workspace instead).
  IF v_target_role = 'owner' AND v_caller <> p_user_id THEN
    RAISE EXCEPTION 'El owner no puede ser removido del workspace';
  END IF;

  -- Find the member's linked responsable (assignee).
  SELECT id INTO v_removed_assignee
  FROM public.assignees
  WHERE workspace_id = p_workspace_id AND linked_user_id = p_user_id
  LIMIT 1;

  IF p_reassign_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assignees
      WHERE id = p_reassign_assignee_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Responsable destino inválido';
    END IF;

    IF v_removed_assignee IS NOT NULL AND p_reassign_assignee_id = v_removed_assignee THEN
      RAISE EXCEPTION 'No puedes reasignar al mismo responsable';
    END IF;
  END IF;

  IF v_removed_assignee IS NOT NULL THEN
    IF p_reassign_assignee_id IS NOT NULL THEN
      -- Reassign to the target responsable, skipping tasks already assigned to it.
      UPDATE public.task_assignees ta
      SET assignee_id = p_reassign_assignee_id
      WHERE ta.assignee_id = v_removed_assignee
        AND NOT EXISTS (
          SELECT 1 FROM public.task_assignees ta2
          WHERE ta2.task_id = ta.task_id AND ta2.assignee_id = p_reassign_assignee_id
        );

      -- Drop any remaining references to the removed responsable.
      DELETE FROM public.task_assignees
      WHERE assignee_id = v_removed_assignee;

      UPDATE public.tasks
      SET responsible_assignee_id = p_reassign_assignee_id
      WHERE responsible_assignee_id = v_removed_assignee;
    ELSE
      -- No reassignment: unassign tasks from the removed responsable.
      DELETE FROM public.task_assignees
      WHERE assignee_id = v_removed_assignee;

      UPDATE public.tasks
      SET responsible_assignee_id = NULL
      WHERE responsible_assignee_id = v_removed_assignee;
    END IF;

    -- Keep the responsable as inactive (unlinked) to preserve task history.
    UPDATE public.assignees
    SET linked_user_id = NULL
    WHERE id = v_removed_assignee;
  END IF;

  -- Remove the membership row.
  DELETE FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_workspace_member(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member(UUID, UUID, UUID) TO service_role;
