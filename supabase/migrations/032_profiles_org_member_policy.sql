-- ============================================================
-- Migration 032: Allow org members to read co-member profiles
-- ============================================================
-- Renumbered from 020: collided with 020_booking_host_multi_profile
-- (duplicate version). Moved to end of sequence to keep migration
-- history strictly ordered and push-able. Independent + idempotent.
-- Needed for CRM owner display (assigned_to UUID → display_name).
-- Additive permissive policy — OR-ed with existing own-profile policy.
-- Security: only members of the SAME active org can see each other's profiles.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'org_members_profiles_select'
  ) THEN
    CREATE POLICY "org_members_profiles_select"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.memberships m1
          JOIN public.memberships m2 ON m1.organization_id = m2.organization_id
          WHERE m1.user_id = auth.uid()
            AND m1.status  = 'active'
            AND m2.user_id = profiles.id
            AND m2.status  = 'active'
        )
      );
  END IF;
END $$;
