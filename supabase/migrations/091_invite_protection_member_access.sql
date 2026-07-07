-- =============================================================================
-- Migration 091: Invite protection & member access rules
-- =============================================================================
--
-- Hardens both invite surfaces:
--   * direct email invite -> memberships.status='invited'
--   * token invite link   -> organization_invites
--
-- The app layer returns friendly messages, but these SECURITY DEFINER RPCs are
-- the authoritative boundary for direct Supabase/API bypass. No raw recipient
-- email is written to logs/events here.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_invite_role(p_role TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT CASE lower(trim(COALESCE(p_role, 'member')))
    WHEN 'member' THEN 'member'
    WHEN 'admin' THEN 'admin'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.invite_organization_access_state(
  p_organization_id UUID,
  p_actor_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_slug TEXT;
  v_status TEXT;
  v_ends TIMESTAMPTZ;
  v_meta JSONB;
  v_pay_state TEXT;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN 'organization_restricted';
  END IF;

  SELECT p.slug, bs.status, bs.trial_ends_at, bs.metadata
    INTO v_slug, v_status, v_ends, v_meta
  FROM public.billing_subscriptions bs
  JOIN public.plans p ON p.id = bs.plan_id
  WHERE bs.organization_id = p_organization_id
  LIMIT 1;

  -- Legacy organizations without a subscription keep their historical access.
  IF v_slug IS NULL THEN
    RETURN 'paid_active';
  END IF;

  IF COALESCE(v_meta ->> 'security_hold', 'false') = 'true' THEN
    RETURN 'organization_restricted';
  END IF;

  v_pay_state := v_meta ->> 'payment_state';
  IF v_pay_state IN ('payment_unpaid', 'payment_grace') THEN
    RETURN 'organization_restricted';
  END IF;

  IF v_slug = 'trial' THEN
    IF v_status = 'trialing' AND v_ends IS NOT NULL AND v_ends > now() THEN
      RETURN 'trialing';
    END IF;
    RETURN 'trial_expired';
  END IF;

  -- Free organizations are collaboration-restricted for invite acceptance by
  -- trial-used identities; paid activation must come from the billing boundary.
  IF v_slug = 'free' THEN
    RETURN 'paid_plan_required';
  END IF;

  RETURN CASE v_status
    WHEN 'active' THEN 'paid_active'
    WHEN 'trialing' THEN 'trialing'
    WHEN 'past_due' THEN 'organization_restricted'
    WHEN 'canceled' THEN 'organization_restricted'
    WHEN 'paused' THEN 'organization_restricted'
    WHEN 'expired' THEN 'paid_plan_required'
    ELSE 'organization_restricted'
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_recipient_trial_used(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_email TEXT;
  v_identity TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_account_unlimited(p_user_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.billing_trial_claims
    WHERE user_id = p_user_id
      AND status IN ('active', 'consumed', 'blocked')
  ) THEN
    RETURN true;
  END IF;

  v_email := public.billing_owner_confirmed_email(p_user_id);
  IF v_email IS NULL THEN
    RETURN false;
  END IF;

  v_identity := public.billing_identity_hash(v_email);
  RETURN EXISTS (
    SELECT 1 FROM public.billing_trial_claims
    WHERE (identity_hash = v_identity OR normalized_email_hash = public.normalized_email_hash(v_email))
      AND status IN ('active', 'consumed', 'blocked')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_invite_decision(
  p_organization_id UUID,
  p_actor_id UUID,
  p_target_user_id UUID,
  p_reason TEXT,
  p_action TEXT DEFAULT 'accept'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF p_reason IS NULL OR p_reason = 'allowed' THEN
    RETURN;
  END IF;

  RAISE LOG 'invite decision action=% reason=% organization=% actor=% target=%',
    p_action, p_reason, p_organization_id, p_actor_id, p_target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_invite_seat_available(
  p_organization_id UUID,
  p_reserved_seat BOOLEAN DEFAULT false,
  p_actor_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  SELECT pl.max_members INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plans pl ON pl.id = bs.plan_id
  WHERE bs.organization_id = p_organization_id
  LIMIT 1;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN 'allowed';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.memberships
  WHERE organization_id = p_organization_id
    AND status IN ('active', 'invited');

  IF (p_reserved_seat AND v_count > v_limit)
     OR (NOT p_reserved_seat AND v_count >= v_limit) THEN
    RETURN 'member_limit_reached';
  END IF;

  RETURN 'allowed';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_accept_invite(
  p_organization_id UUID,
  p_user_id UUID,
  p_role TEXT,
  p_reserved_seat BOOLEAN DEFAULT false,
  p_actor_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role TEXT := public.normalize_invite_role(p_role);
  v_state TEXT;
  v_seat TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'auth_required';
  END IF;
  IF v_role IS NULL THEN
    RETURN 'role_not_allowed';
  END IF;

  v_state := public.invite_organization_access_state(p_organization_id, NULL);

  IF v_state NOT IN ('trialing', 'paid_active', 'developer_unlimited') THEN
    RETURN v_state;
  END IF;

  IF public.invite_recipient_trial_used(p_user_id) THEN
    IF v_role <> 'member' THEN
      RETURN 'billing_owner_restricted';
    END IF;
    IF v_state NOT IN ('paid_active', 'developer_unlimited') THEN
      RETURN 'trial_already_used';
    END IF;
  END IF;

  v_seat := public.assert_invite_seat_available(
    p_organization_id,
    p_reserved_seat,
    COALESCE(p_actor_id, p_user_id)
  );
  IF v_seat <> 'allowed' THEN
    RETURN v_seat;
  END IF;

  RETURN 'allowed';
END;
$$;

CREATE OR REPLACE FUNCTION public.check_invite_sender_eligibility(
  p_organization_id UUID,
  p_role TEXT DEFAULT 'member',
  p_actor_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor UUID := COALESCE(p_actor_id, auth.uid());
  v_role TEXT := public.normalize_invite_role(p_role);
  v_state TEXT;
  v_seat TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN 'auth_required';
  END IF;
  IF NOT public.is_org_admin(p_organization_id) THEN
    RETURN 'permission_denied';
  END IF;
  IF v_role IS NULL THEN
    RETURN 'role_not_allowed';
  END IF;

  v_state := public.invite_organization_access_state(p_organization_id, NULL);
  IF v_state NOT IN ('trialing', 'paid_active', 'developer_unlimited') THEN
    RETURN v_state;
  END IF;

  v_seat := public.assert_invite_seat_available(p_organization_id, false, v_actor);
  IF v_seat <> 'allowed' THEN
    RETURN v_seat;
  END IF;

  RETURN 'allowed';
END;
$$;

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
  v_caller UUID := auth.uid();
  v_target UUID;
  v_role TEXT := public.normalize_invite_role(p_role);
  v_reason TEXT;
  v_id UUID;
BEGIN
  v_reason := public.check_invite_sender_eligibility(p_org_id, p_role, v_caller);
  IF v_reason <> 'allowed' THEN
    PERFORM public.audit_invite_decision(p_org_id, v_caller, NULL, v_reason, 'send');
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'role_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_target
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = p_org_id AND user_id = v_target
  ) THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = 'P0001';
  END IF;

  v_reason := public.can_accept_invite(p_org_id, v_target, v_role, false, NULL);
  IF v_reason <> 'allowed' THEN
    PERFORM public.audit_invite_decision(p_org_id, v_caller, v_target, v_reason, 'send');
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_target, p_org_id, v_role, 'invited')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
  v_caller UUID := auth.uid();
  v_role TEXT := public.normalize_invite_role(p_role);
  v_reason TEXT;
  v_token TEXT;
BEGIN
  v_reason := public.check_invite_sender_eligibility(p_org_id, p_role, v_caller);
  IF v_reason <> 'allowed' THEN
    PERFORM public.audit_invite_decision(p_org_id, v_caller, NULL, v_reason, 'send');
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'role_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.organization_invites (organization_id, token, role, created_by)
  VALUES (p_org_id, v_token, v_role, v_caller);

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invite(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  v_reason TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT role INTO v_role
  FROM public.memberships
  WHERE organization_id = p_org_id
    AND user_id = v_user
    AND status = 'invited'
  LIMIT 1
  FOR UPDATE;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_reason := public.can_accept_invite(p_org_id, v_user, v_role, true, v_user);
  IF v_reason <> 'allowed' THEN
    PERFORM public.audit_invite_decision(p_org_id, v_user, v_user, v_reason, 'accept');
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.memberships
  SET status = 'active', updated_at = now()
  WHERE organization_id = p_org_id
    AND user_id = v_user
    AND status = 'invited';
END;
$$;

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
  v_status TEXT;
  v_expires_at TIMESTAMPTZ;
  v_created_by UUID;
  v_reason TEXT;
  v_existing_status TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id, role, status, expires_at, created_by
    INTO v_org, v_role, v_status, v_expires_at, v_created_by
  FROM public.organization_invites
  WHERE token = p_token
  LIMIT 1
  FOR UPDATE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'invite_already_used' USING ERRCODE = 'P0001';
  END IF;
  IF v_expires_at <= now() THEN
    RAISE EXCEPTION 'invite_expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_existing_status
  FROM public.memberships
  WHERE organization_id = v_org
    AND user_id = v_user
  LIMIT 1;

  v_reason := public.can_accept_invite(
    v_org,
    v_user,
    v_role,
    COALESCE(v_existing_status IN ('active', 'invited'), false),
    NULL
  );
  IF v_reason <> 'allowed' THEN
    PERFORM public.audit_invite_decision(v_org, v_user, v_user, v_reason, 'accept');
    RAISE EXCEPTION '%', v_reason USING ERRCODE = 'P0001';
  END IF;

  IF v_existing_status IS NOT NULL THEN
    UPDATE public.organization_invites
    SET status = 'accepted', accepted_by = v_user, accepted_at = now()
    WHERE token = p_token;
    RETURN v_org;
  END IF;

  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_user, v_org, public.normalize_invite_role(v_role), 'active');

  UPDATE public.organization_invites
  SET status = 'accepted', accepted_by = v_user, accepted_at = now()
  WHERE token = p_token;

  RETURN v_org;
END;
$$;

COMMENT ON FUNCTION public.can_accept_invite(UUID, UUID, TEXT, BOOLEAN, UUID) IS
  'Invite acceptance policy: validates role, current organization access state, '
  'recipient trial-use restrictions, and member seat availability.';

COMMENT ON FUNCTION public.invite_member(UUID, TEXT, TEXT) IS
  'Invite existing user by email. Re-checks sender eligibility, recipient trial '
  'eligibility, role restrictions, and member limit before creating invited membership.';

COMMENT ON FUNCTION public.accept_invite(UUID) IS
  'Accept direct membership invite. Re-checks current billing/access state, role '
  'restrictions, trial-use restrictions, and member limit before activation.';

COMMENT ON FUNCTION public.accept_invite_link(TEXT) IS
  'Accept token invite. Row-locks token, distinguishes invalid/expired/used, and '
  're-checks billing/access state, trial-use restrictions, role, and member limit.';

DO $$
DECLARE
  fn TEXT;
  fns TEXT[] := ARRAY[
    'public.normalize_invite_role(TEXT)',
    'public.invite_organization_access_state(UUID, UUID)',
    'public.invite_recipient_trial_used(UUID)',
    'public.audit_invite_decision(UUID, UUID, UUID, TEXT, TEXT)',
    'public.assert_invite_seat_available(UUID, BOOLEAN, UUID)',
    'public.can_accept_invite(UUID, UUID, TEXT, BOOLEAN, UUID)',
    'public.check_invite_sender_eligibility(UUID, TEXT, UUID)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon;', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated;', fn);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.invite_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_invite_link(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invite(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invite_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_member(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invite_link(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite_link(TEXT) TO authenticated;

COMMIT;
