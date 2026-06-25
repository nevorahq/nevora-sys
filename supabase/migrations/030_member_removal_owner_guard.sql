-- =============================================================================
-- Migration 030: Close the owner self-removal gap in memberships_delete
--
-- Migration 029 allowed a member to delete their own membership while the org
-- is writable. That branch did not exclude owners, so an owner could remove
-- themselves via a direct API call and leave the organization with no owner —
-- contradicting the policy's own intent ("an owner is never removable").
--
-- This migration redefines the DELETE policy so that:
--   * a member may still leave the org (self-removal), but
--   * the LAST active owner can never be removed — not by themselves and not by
--     another admin — preventing an orphaned organization.
--
-- The owner check lives in a SECURITY DEFINER helper so the policy never
-- re-enters RLS on public.memberships (avoids recursive-policy evaluation).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.org_has_other_active_owner(
  p_org_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.organization_id = p_org_id
      AND m.role = 'owner'
      AND m.status = 'active'
      AND m.user_id <> p_user_id
  );
$$;

COMMENT ON FUNCTION public.org_has_other_active_owner(UUID, UUID) IS
  'True when the org has at least one active owner other than the given user. Used to block removal of the last owner.';

DROP POLICY IF EXISTS "memberships_delete" ON public.memberships;
CREATE POLICY "memberships_delete"
  ON public.memberships
  FOR DELETE
  TO authenticated
  USING (
    -- Self-removal (leave org): allowed while writable, but the last owner
    -- cannot remove themselves and orphan the organization.
    (
      user_id = auth.uid()
      AND public.is_organization_writable(organization_id)
      AND (
        role <> 'owner'
        OR public.org_has_other_active_owner(organization_id, user_id)
      )
    )
    -- Admin/owner removing a teammate: never an owner.
    OR (
      public.can_manage_users(organization_id)
      AND role <> 'owner'
    )
  );
