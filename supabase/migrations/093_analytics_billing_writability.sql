-- =============================================================================
-- Migration 093: Analytics billing-aware writability (Phase 9 security blocker)
--
-- The original analytics policies (migration 010) gated writes on membership /
-- admin status only (is_org_member / is_org_admin) and never checked whether the
-- organization is *writable*. That let an expired-trial, unpaid, canceled or
-- otherwise restricted org mutate analytics via a direct Supabase API call —
-- bypassing the app-layer entitlement gate.
--
-- This forward migration tightens INSERT / UPDATE / DELETE on the three
-- analytics tables to also require public.can_write_data(organization_id), which
-- composes membership + is_organization_writable (trial lifecycle / billing
-- state, migrations 027/033/059). SELECT policies are left unchanged so a
-- blocked org can still read its analytics.
--
-- Forward-only: migration 010 is not edited.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- analytics_snapshots — admin-only writes, now billing-aware
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admins can insert snapshots" ON analytics_snapshots;
CREATE POLICY "admins can insert snapshots"
  ON analytics_snapshots FOR INSERT
  WITH CHECK (
    is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "admins can update snapshots" ON analytics_snapshots;
CREATE POLICY "admins can update snapshots"
  ON analytics_snapshots FOR UPDATE
  USING (
    is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
  )
  WITH CHECK (
    is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
  );

-- ---------------------------------------------------------------------------
-- analytics_widgets — was a single admin FOR ALL policy (which also covered
-- writes). Split it into explicit write policies so SELECT stays reachable for
-- blocked orgs while INSERT / UPDATE / DELETE require writability.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admins can manage widgets" ON analytics_widgets;

DROP POLICY IF EXISTS "admins can insert widgets" ON analytics_widgets;
CREATE POLICY "admins can insert widgets"
  ON analytics_widgets FOR INSERT
  WITH CHECK (
    is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "admins can update widgets" ON analytics_widgets;
CREATE POLICY "admins can update widgets"
  ON analytics_widgets FOR UPDATE
  USING (
    is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
  )
  WITH CHECK (
    is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "admins can delete widgets" ON analytics_widgets;
CREATE POLICY "admins can delete widgets"
  ON analytics_widgets FOR DELETE
  USING (
    is_org_admin(organization_id)
    AND public.can_write_data(organization_id)
  );

-- ---------------------------------------------------------------------------
-- analytics_reports — member create + author/admin update, now billing-aware
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "members can create reports" ON analytics_reports;
CREATE POLICY "members can create reports"
  ON analytics_reports FOR INSERT
  WITH CHECK (
    is_org_member(organization_id)
    AND auth.uid() = created_by
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "author or admin can update report" ON analytics_reports;
CREATE POLICY "author or admin can update report"
  ON analytics_reports FOR UPDATE
  USING (
    is_org_member(organization_id)
    AND (auth.uid() = created_by OR is_org_admin(organization_id))
    AND public.can_write_data(organization_id)
    AND deleted_at IS NULL
  )
  WITH CHECK (
    is_org_member(organization_id)
    AND (auth.uid() = created_by OR is_org_admin(organization_id))
    AND public.can_write_data(organization_id)
  );
