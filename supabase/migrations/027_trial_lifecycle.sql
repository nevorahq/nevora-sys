-- =============================================================================
-- Migration 027: Trial lifecycle and read-only enforcement
--
-- A trial expires from its timestamp, even when no background worker has run.
-- `is_organization_writable` is used by RLS policies, making the database the
-- final authority for the read-only state (not the frontend or Server Actions).
-- =============================================================================

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_status_check;

ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_status_check
  CHECK (status IN ('trialing', 'expired', 'active', 'past_due', 'canceled', 'paused'));

CREATE OR REPLACE FUNCTION public.is_organization_writable(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT
      CASE
        -- Non-trial plans retain their existing billing behaviour.
        WHEN p.slug <> 'trial' THEN bs.status NOT IN ('canceled', 'paused')
        -- A trial is writable only until its fixed end date.
        WHEN bs.status = 'trialing'
          AND bs.trial_ends_at IS NOT NULL
          AND bs.trial_ends_at > now() THEN TRUE
        ELSE FALSE
      END
    FROM public.billing_subscriptions bs
    JOIN public.plans p ON p.id = bs.plan_id
    WHERE bs.organization_id = p_organization_id
    LIMIT 1
  ), TRUE);
$$;

COMMENT ON FUNCTION public.is_organization_writable(UUID) IS
  'Returns false for an expired trial. Legacy organizations without a subscription remain writable.';

CREATE OR REPLACE FUNCTION public.refresh_trial_status(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_status TEXT;
BEGIN
  UPDATE public.billing_subscriptions bs
  SET status = 'expired', updated_at = now()
  FROM public.plans p
  WHERE bs.organization_id = p_organization_id
    AND bs.plan_id = p.id
    AND p.slug = 'trial'
    AND bs.status = 'trialing'
    AND bs.trial_ends_at <= now();

  SELECT status INTO v_status
  FROM public.billing_subscriptions
  WHERE organization_id = p_organization_id;

  RETURN COALESCE(v_status, 'active');
END;
$$;

COMMENT ON FUNCTION public.refresh_trial_status(UUID) IS
  'Persists an overdue trial as expired; safe to call while rendering a signed-in organization.';

CREATE OR REPLACE FUNCTION public.can_manage_users(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_org_admin(p_organization_id)
    AND public.is_organization_writable(p_organization_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_workspace(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_org_admin(p_organization_id)
    AND public.is_organization_writable(p_organization_id);
$$;

CREATE OR REPLACE FUNCTION public.can_write_data(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
      AND role IN ('owner', 'admin', 'manager', 'member')
  ) AND public.is_organization_writable(p_organization_id);
$$;

CREATE OR REPLACE FUNCTION public.can_delete_data(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships
    WHERE user_id = auth.uid()
      AND organization_id = p_organization_id
      AND status = 'active'
      AND role IN ('owner', 'admin', 'manager')
  ) AND public.is_organization_writable(p_organization_id);
$$;

-- Invite RPCs are SECURITY DEFINER and therefore need the lifecycle guard
-- explicitly instead of relying on table RLS alone.
CREATE OR REPLACE FUNCTION public.invite_member(
  p_org_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'member'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller UUID;
  v_target UUID;
  v_limit INT;
  v_count INT;
  v_id UUID;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_org_admin(p_org_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.is_organization_writable(p_org_id) THEN RAISE EXCEPTION 'trial_expired'; END IF;
  IF p_role NOT IN ('member', 'admin') THEN RAISE EXCEPTION 'invalid_role'; END IF;

  SELECT id INTO v_target FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.memberships WHERE organization_id = p_org_id AND user_id = v_target) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  SELECT pl.max_members INTO v_limit
  FROM public.billing_subscriptions bs JOIN public.plans pl ON pl.id = bs.plan_id
  WHERE bs.organization_id = p_org_id;
  IF v_limit IS NOT NULL AND v_limit <> -1 THEN
    SELECT count(*) INTO v_count FROM public.memberships
    WHERE organization_id = p_org_id AND status IN ('active', 'invited');
    IF v_count >= v_limit THEN RAISE EXCEPTION 'member_limit_reached'; END IF;
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_target, p_org_id, p_role, 'invited') RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

DROP POLICY IF EXISTS "org_invites_admin_write" ON public.organization_invites;
CREATE POLICY "org_invites_admin_write"
  ON public.organization_invites FOR ALL
  TO authenticated
  USING (public.can_manage_users(organization_id))
  WITH CHECK (public.can_manage_users(organization_id));

CREATE OR REPLACE FUNCTION public.create_invite_link(
  p_org_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_org_admin(p_org_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.is_organization_writable(p_org_id) THEN RAISE EXCEPTION 'trial_expired'; END IF;
  IF p_role NOT IN ('member', 'admin') THEN RAISE EXCEPTION 'invalid_role'; END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.organization_invites (organization_id, token, role, created_by)
  VALUES (p_org_id, v_token, p_role, auth.uid());
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invite_link(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID;
  v_org UUID;
  v_role TEXT;
  v_limit INT;
  v_count INT;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT organization_id, role INTO v_org, v_role
  FROM public.organization_invites
  WHERE token = p_token AND status = 'pending' AND expires_at > now()
  LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'invite_invalid'; END IF;
  IF NOT public.is_organization_writable(v_org) THEN RAISE EXCEPTION 'trial_expired'; END IF;

  IF EXISTS (SELECT 1 FROM public.memberships WHERE organization_id = v_org AND user_id = v_user) THEN
    UPDATE public.organization_invites SET status = 'accepted', accepted_by = v_user, accepted_at = now()
    WHERE token = p_token;
    RETURN v_org;
  END IF;

  SELECT pl.max_members INTO v_limit
  FROM public.billing_subscriptions bs JOIN public.plans pl ON pl.id = bs.plan_id
  WHERE bs.organization_id = v_org;
  IF v_limit IS NOT NULL AND v_limit <> -1 THEN
    SELECT count(*) INTO v_count FROM public.memberships
    WHERE organization_id = v_org AND status IN ('active', 'invited');
    IF v_count >= v_limit THEN RAISE EXCEPTION 'member_limit_reached'; END IF;
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_user, v_org, v_role, 'active');
  UPDATE public.organization_invites SET status = 'accepted', accepted_by = v_user, accepted_at = now()
  WHERE token = p_token;
  RETURN v_org;
END;
$$;
