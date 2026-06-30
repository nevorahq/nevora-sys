-- =============================================================================
-- Migration 059: internal Developer Unlimited Access
--
-- This is an account override, not a public plan. Product quota and trial
-- write guards can be bypassed; RLS, RBAC, validation, rate limiting, payload
-- limits, file-size limits and provider safety limits remain unchanged.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS unlimited_access BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_role_check
  CHECK (account_role IN ('user', 'developer', 'admin', 'owner'));

COMMENT ON COLUMN public.profiles.account_role IS
  'Internal account-level role. Separate from organization membership roles.';
COMMENT ON COLUMN public.profiles.unlimited_access IS
  'Internal override for product quotas only. Never bypasses security or infrastructure limits.';

-- RLS is row-level and cannot protect individual columns. This trigger blocks
-- ordinary authenticated table updates while allowing SECURITY DEFINER admin
-- RPCs and service-role back-office operations.
CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF (NEW.account_role, NEW.unlimited_access)
       IS DISTINCT FROM
     (OLD.account_role, OLD.unlimited_access)
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'protected_profile_access_fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_access_fields ON public.profiles;
CREATE TRIGGER protect_profile_access_fields
  BEFORE UPDATE OF account_role, unlimited_access ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();

-- Existing audit log is reused. Account-level events have no organization,
-- and target_user_id keeps the affected account explicit and queryable.
ALTER TABLE public.audit_logs
  ALTER COLUMN organization_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (action IN (
    'create', 'update', 'delete', 'restore',
    'assign', 'unassign',
    'role_change', 'permission_change',
    'status_change', 'stage_change',
    'billing_change', 'invite', 'suspend',
    'developer_access.enabled',
    'developer_access.disabled',
    'developer_access.updated'
  ));

CREATE INDEX IF NOT EXISTS audit_logs_target_user_idx
  ON public.audit_logs (target_user_id, created_at DESC);

DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR target_user_id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id))
  );

-- Private helper used only by SECURITY DEFINER quota/admin functions.
CREATE OR REPLACE FUNCTION public.is_account_unlimited(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT p.unlimited_access
    FROM public.profiles p
    WHERE p.id = p_user_id
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_account_unlimited(UUID) FROM PUBLIC, anon, authenticated;

-- Account admins/owners can manage the override through an authenticated,
-- audited and atomic RPC. Organization owner/admin roles do not qualify.
CREATE OR REPLACE FUNCTION public.set_developer_access(
  p_target_user_id UUID,
  p_enabled BOOLEAN,
  p_reason TEXT
)
RETURNS TABLE (
  user_id UUID,
  account_role TEXT,
  unlimited_access BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_role TEXT;
  v_previous_role TEXT;
  v_previous_unlimited BOOLEAN;
  v_action TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(trim(COALESCE(p_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'developer_access_reason_required';
  END IF;

  SELECT p.account_role INTO v_actor_role
  FROM public.profiles p WHERE p.id = v_actor;

  IF v_actor_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'developer_access_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT p.account_role, p.unlimited_access
    INTO v_previous_role, v_previous_unlimited
  FROM public.profiles p
  WHERE p.id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'target_profile_not_found'; END IF;

  UPDATE public.profiles p
  SET account_role = CASE
        WHEN p_enabled AND p.account_role IN ('admin', 'owner') THEN p.account_role
        WHEN p_enabled THEN 'developer'
        WHEN NOT p_enabled AND p.account_role = 'developer' THEN 'user'
        ELSE p.account_role
      END,
      unlimited_access = p_enabled,
      updated_at = now()
  WHERE p.id = p_target_user_id;

  v_action := CASE
    WHEN p_enabled AND NOT v_previous_unlimited THEN 'developer_access.enabled'
    WHEN NOT p_enabled AND v_previous_unlimited THEN 'developer_access.disabled'
    ELSE 'developer_access.updated'
  END;

  INSERT INTO public.audit_logs (
    organization_id, user_id, target_user_id, entity_type, entity_id,
    action, old_data, new_data, metadata
  ) VALUES (
    NULL, v_actor, p_target_user_id, 'profiles', p_target_user_id,
    v_action,
    jsonb_build_object('account_role', v_previous_role, 'unlimited_access', v_previous_unlimited),
    jsonb_build_object(
      'account_role', CASE
        WHEN p_enabled AND v_previous_role IN ('admin', 'owner') THEN v_previous_role
        WHEN p_enabled THEN 'developer'
        WHEN NOT p_enabled AND v_previous_role = 'developer' THEN 'user'
        ELSE v_previous_role
      END,
      'unlimited_access', p_enabled
    ),
    jsonb_build_object('reason', trim(p_reason), 'source', 'admin_rpc')
  );

  RETURN QUERY
  SELECT p.id, p.account_role, p.unlimited_access
  FROM public.profiles p WHERE p.id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_developer_access(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_developer_access(UUID, BOOLEAN, TEXT) TO authenticated;

-- Controlled bootstrap/back-office path. It is intentionally unavailable to
-- browser roles and is useful before the first account owner exists.
CREATE OR REPLACE FUNCTION public.set_developer_access_by_email(
  p_email TEXT,
  p_enabled BOOLEAN,
  p_reason TEXT
)
RETURNS TABLE (
  user_id UUID,
  account_role TEXT,
  unlimited_access BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_target UUID;
  v_previous_role TEXT;
  v_previous_unlimited BOOLEAN;
  v_action TEXT;
BEGIN
  IF length(trim(COALESCE(p_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'developer_access_reason_required';
  END IF;

  SELECT u.id INTO v_target
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'target_user_not_found'; END IF;

  SELECT p.account_role, p.unlimited_access
    INTO v_previous_role, v_previous_unlimited
  FROM public.profiles p WHERE p.id = v_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target_profile_not_found'; END IF;

  UPDATE public.profiles p
  SET account_role = CASE
        WHEN p_enabled AND p.account_role IN ('admin', 'owner') THEN p.account_role
        WHEN p_enabled THEN 'developer'
        WHEN NOT p_enabled AND p.account_role = 'developer' THEN 'user'
        ELSE p.account_role
      END,
      unlimited_access = p_enabled,
      updated_at = now()
  WHERE p.id = v_target;

  v_action := CASE
    WHEN p_enabled AND NOT v_previous_unlimited THEN 'developer_access.enabled'
    WHEN NOT p_enabled AND v_previous_unlimited THEN 'developer_access.disabled'
    ELSE 'developer_access.updated'
  END;

  INSERT INTO public.audit_logs (
    organization_id, user_id, target_user_id, entity_type, entity_id,
    action, old_data, new_data, metadata
  ) VALUES (
    NULL, NULL, v_target, 'profiles', v_target, v_action,
    jsonb_build_object('account_role', v_previous_role, 'unlimited_access', v_previous_unlimited),
    jsonb_build_object(
      'account_role', CASE
        WHEN p_enabled AND v_previous_role IN ('admin', 'owner') THEN v_previous_role
        WHEN p_enabled THEN 'developer'
        WHEN NOT p_enabled AND v_previous_role = 'developer' THEN 'user'
        ELSE v_previous_role
      END,
      'unlimited_access', p_enabled
    ),
    jsonb_build_object('reason', trim(p_reason), 'source', 'service_role')
  );

  RETURN QUERY
  SELECT p.id, p.account_role, p.unlimited_access
  FROM public.profiles p WHERE p.id = v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.set_developer_access_by_email(TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_developer_access_by_email(TEXT, BOOLEAN, TEXT)
  TO service_role;

-- Subscription lifecycle stays authoritative for regular users. The internal
-- override only changes writability for the acting developer account.
CREATE OR REPLACE FUNCTION public.is_organization_writable(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.is_account_unlimited(auth.uid()) OR COALESCE((
    SELECT CASE
      WHEN p.slug = 'trial' THEN
        bs.status = 'trialing'
        AND bs.trial_ends_at IS NOT NULL
        AND bs.trial_ends_at > now()
      WHEN bs.status = 'canceled' THEN bs.current_period_end > now()
      ELSE bs.status NOT IN ('paused', 'expired')
    END
    FROM public.billing_subscriptions bs
    JOIN public.plans p ON p.id = bs.plan_id
    WHERE bs.organization_id = p_organization_id
    LIMIT 1
  ), TRUE);
$$;

CREATE OR REPLACE FUNCTION public.organization_plan_limit(
  p_organization_id UUID,
  p_metric TEXT
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_limit INT;
BEGIN
  IF public.is_account_unlimited(auth.uid()) THEN RETURN -1; END IF;

  SELECT CASE p_metric
    WHEN 'members' THEN p.max_members
    WHEN 'workspaces' THEN p.max_workspaces
    WHEN 'tasks' THEN p.max_tasks
    WHEN 'deals' THEN p.max_deals
    WHEN 'clients' THEN p.max_clients
    WHEN 'documents' THEN p.max_documents
    WHEN 'subscriptions' THEN p.max_subscriptions
    WHEN 'money_transactions' THEN p.max_money_transactions
    WHEN 'ai_calls' THEN p.max_ai_calls_mo
    WHEN 'storage_mb' THEN p.max_storage_mb
  END INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plans p ON p.id = bs.plan_id
  WHERE bs.organization_id = p_organization_id
  LIMIT 1;

  RETURN v_limit;
END;
$$;

-- Database quota enforcement remains authoritative. For background AI jobs,
-- ai_requests.user_id identifies the actor when there is no request JWT.
CREATE OR REPLACE FUNCTION public.enforce_plan_insert_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_metric TEXT := TG_ARGV[0];
  v_org UUID := NEW.organization_id;
  v_actor UUID := auth.uid();
  v_limit INT;
  v_used NUMERIC := 0;
BEGIN
  IF v_metric = 'ai_calls' AND v_actor IS NULL THEN v_actor := NEW.user_id; END IF;
  IF public.is_account_unlimited(v_actor) THEN RETURN NEW; END IF;

  IF NOT public.is_organization_writable(v_org) THEN
    RAISE EXCEPTION 'subscription_not_writable'
      USING ERRCODE = '42501', DETAIL = 'The organization subscription does not allow mutations.';
  END IF;

  v_limit := public.organization_plan_limit(v_org, v_metric);
  IF v_limit IS NULL OR v_limit = -1 THEN RETURN NEW; END IF;

  CASE v_metric
    WHEN 'members' THEN
      SELECT count(*) INTO v_used FROM public.memberships
      WHERE organization_id = v_org AND status IN ('active', 'invited');
    WHEN 'workspaces' THEN
      SELECT count(*) INTO v_used FROM public.workspaces WHERE organization_id = v_org;
    WHEN 'tasks' THEN
      SELECT count(*) INTO v_used FROM public.todos
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'clients' THEN
      SELECT count(*) INTO v_used FROM public.crm_clients
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'deals' THEN
      SELECT count(*) INTO v_used FROM public.crm_deals
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'documents' THEN
      SELECT count(*) INTO v_used FROM public.documents
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'subscriptions' THEN
      SELECT count(*) INTO v_used FROM public.subscriptions WHERE organization_id = v_org;
    WHEN 'money_transactions' THEN
      SELECT count(*) INTO v_used FROM public.money_transactions
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'ai_calls' THEN
      SELECT count(*) INTO v_used FROM public.ai_requests
      WHERE organization_id = v_org AND created_at >= date_trunc('month', now());
    WHEN 'storage_mb' THEN
      SELECT COALESCE(sum(file_size), 0) / 1048576.0 INTO v_used
      FROM public.document_attachments WHERE organization_id = v_org;
      v_used := v_used + COALESCE(NEW.file_size, 0) / 1048576.0;
      IF v_used <= v_limit THEN RETURN NEW; END IF;
  END CASE;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'plan_limit_reached: %', v_metric
      USING ERRCODE = 'P0001', DETAIL = format('%s limit is %s for this organization.', v_metric, v_limit);
  END IF;
  RETURN NEW;
END;
$$;

-- Existing-user email invite: the caller is the product actor.
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
  v_limit INT;
  v_count INT;
  v_id UUID;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_org_admin(p_org_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF NOT public.is_organization_writable(p_org_id) THEN RAISE EXCEPTION 'trial_expired'; END IF;
  IF p_role NOT IN ('member', 'admin') THEN RAISE EXCEPTION 'invalid_role'; END IF;

  SELECT id INTO v_target FROM auth.users
  WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = p_org_id AND user_id = v_target
  ) THEN RAISE EXCEPTION 'already_member'; END IF;

  v_limit := public.organization_plan_limit(p_org_id, 'members');
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

-- Token invite acceptance remembers the developer who created the invite, so
-- the quota does not reappear merely because acceptance is a second request.
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
  SELECT organization_id, role, created_by INTO v_org, v_role, v_created_by
  FROM public.organization_invites
  WHERE token = p_token AND status = 'pending' AND expires_at > now()
  LIMIT 1;
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

-- Match the existing hardening posture for SECURITY DEFINER helpers.
REVOKE ALL ON FUNCTION public.protect_profile_access_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organization_plan_limit(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_plan_insert_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_member(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_member(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_invite_link(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite_link(TEXT) TO authenticated;
