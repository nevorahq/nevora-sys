-- =============================================================================
-- Migration 090: Security hardening follow-ups (Phase 0 audit remediation)
--
-- Closes two items from docs/security/SECURITY_CONTROL_PLANE_AUDIT.md:
--
--   1. init_free_subscription() — the only SECURITY DEFINER function without an
--      explicit search_path (Appendix A). Dormant (no caller; provisioning is
--      internal-only since 035), so this is latent hygiene rather than a live
--      hole — but we harden it for completeness. Body is unchanged.
--
--   2. accept_invite_link() — the pending-status SELECT was not row-locked, so
--      two concurrent accepts of the same token could each pass the
--      status='pending' check (Appendix C, "new Low"). The 076 seat trigger
--      already prevents overshooting max_members, but the invite could admit
--      more than one member. Adding FOR UPDATE makes a token strictly
--      single-use: the second accept blocks, then sees status='accepted' and
--      is rejected as invite_invalid.
--
-- Non-destructive: both are CREATE OR REPLACE of existing functions, signatures
-- and grants unchanged.
--
-- ROLLBACK: re-apply the prior definitions — init_free_subscription from
-- 012_saas_billing.sql and accept_invite_link from 059_developer_unlimited_access.sql.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. init_free_subscription(uuid) — add explicit search_path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.init_free_subscription(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  SELECT id INTO v_plan_id FROM public.plans WHERE slug = 'free' LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.billing_subscriptions (
    organization_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end
  ) VALUES (
    p_org_id, v_plan_id, 'active', 'monthly',
    now(), now() + INTERVAL '100 years'
  )
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.init_free_subscription(UUID) IS
  'Legacy/dormant free-plan provisioner. Internal-only (grants revoked in 035); '
  'hardened with an explicit search_path in 090. Not called by current flows.';

REVOKE ALL ON FUNCTION public.init_free_subscription(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. accept_invite_link(text) — row-lock the invite so acceptance is strictly
--    single-use under concurrency. Only change vs the 059 definition is
--    `FOR UPDATE` on the pending-status SELECT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite_link(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_org UUID;
  v_role TEXT;
  v_created_by UUID;
  v_limit INT;
  v_count INT;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- FOR UPDATE: serialize concurrent accepts of the same token. The second
  -- caller blocks here until the first commits, then this row no longer
  -- matches status='pending' and it falls through to invite_invalid.
  SELECT organization_id, role, created_by INTO v_org, v_role, v_created_by
  FROM public.organization_invites
  WHERE token = p_token AND status = 'pending' AND expires_at > now()
  LIMIT 1
  FOR UPDATE;
  IF v_org IS NULL THEN RAISE EXCEPTION 'invite_invalid'; END IF;

  IF NOT public.is_account_unlimited(v_created_by)
     AND NOT public.is_organization_writable(v_org) THEN
    RAISE EXCEPTION 'trial_expired';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = v_org AND user_id = v_user
  ) THEN
    UPDATE public.organization_invites
    SET status = 'accepted', accepted_by = v_user, accepted_at = now()
    WHERE token = p_token;
    RETURN v_org;
  END IF;

  IF public.is_account_unlimited(v_created_by) OR public.is_account_unlimited(v_user) THEN
    v_limit := -1;
  ELSE
    SELECT pl.max_members INTO v_limit
    FROM public.billing_subscriptions bs
    JOIN public.plans pl ON pl.id = bs.plan_id
    WHERE bs.organization_id = v_org;
  END IF;

  IF v_limit IS NOT NULL AND v_limit <> -1 THEN
    SELECT count(*) INTO v_count FROM public.memberships
    WHERE organization_id = v_org AND status IN ('active', 'invited');
    IF v_count >= v_limit THEN RAISE EXCEPTION 'member_limit_reached'; END IF;
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_user, v_org, v_role, 'active');
  UPDATE public.organization_invites
  SET status = 'accepted', accepted_by = v_user, accepted_at = now()
  WHERE token = p_token;
  RETURN v_org;
END;
$$;

COMMENT ON FUNCTION public.accept_invite_link(TEXT) IS
  'Accept token invite → membership active. Enforces plan member limit. '
  'Row-locks the pending invite (FOR UPDATE) so a token is strictly single-use '
  'under concurrent accepts. SECURITY DEFINER.';

REVOKE ALL ON FUNCTION public.accept_invite_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite_link(TEXT) TO authenticated;

COMMIT;
