-- Member removal follows the same lifecycle guard as invitations. A trial in
-- read-only mode cannot change the team, and an organization owner is never
-- removable through a member-management request.

DROP POLICY IF EXISTS "memberships_delete" ON public.memberships;
CREATE POLICY "memberships_delete"
  ON public.memberships
  FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND public.is_organization_writable(organization_id))
    OR (
      public.can_manage_users(organization_id)
      AND role <> 'owner'
    )
  );
