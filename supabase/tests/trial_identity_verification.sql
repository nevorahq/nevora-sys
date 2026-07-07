-- Trial Identity Hardening (migration 089) verification harness.
--
-- Run ONLY against a local/test/staging database. All fixtures live inside a
-- transaction that is rolled back at the end.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/trial_identity_verification.sql
--
-- Covers the Phase 1 DoD: HMAC identity (not sha256), server-side eligibility,
-- one-trial-per-identity under race, typed reason codes / access states, no
-- raw email in claim/identity/security-event rows, developer-unlimited and
-- permission gating.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'trial_identity verification failed: %', message; END IF; END $$;

-- Mirrors Supabase auth.uid() resolution (empty string => unauthenticated).
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', p_user, true); END $$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- owner/member/dev/unconfirmed users; orgs A (owner's first), B (owner's
-- second), C (dev's), D (unconfirmed user's).
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ti-owner@example.test',  'x', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ti-member@example.test', 'x', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'ti-dev@example.test',    'x', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'ti-unconf@example.test', 'x', NULL,  now(), now());

INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'TI Org A', 'ti-org-a-089', 'trial'),
  ('e0000000-0000-4000-8000-000000000002', 'TI Org B', 'ti-org-b-089', 'trial'),
  ('e0000000-0000-4000-8000-000000000003', 'TI Org C', 'ti-org-c-089', 'trial'),
  ('e0000000-0000-4000-8000-000000000004', 'TI Org D', 'ti-org-d-089', 'trial');

INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'owner',  'active'),
  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'member', 'active'),
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'owner',  'active'),
  ('d0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', 'owner',  'active'),
  ('d0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000004', 'owner',  'active');

-- Developer unlimited for the dev user (protect trigger blocks direct writes,
-- so drop it for the fixture only — we are in a rolled-back tx as superuser).
ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_access_fields;
UPDATE public.profiles SET account_role = 'developer', unlimited_access = true
WHERE id = 'd0000000-0000-4000-8000-000000000003';
ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_access_fields;

-- ── HMAC identity is keyed, not plain sha256 ────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.assert_true(
    public.billing_identity_hash('ti-owner@example.test')
      <> public.normalized_email_hash('ti-owner@example.test'),
    'HMAC identity_hash must differ from unsalted sha256');
  PERFORM pg_temp.assert_true(
    public.billing_identity_hash('TI-Owner@Example.Test ')
      = public.billing_identity_hash('ti-owner@example.test'),
    'identity_hash must canonicalize (lower + trim)');
END $$;

-- ── Positive: fresh owner claims trial exactly once ─────────────────────────
DO $$
DECLARE
  v_elig jsonb;
  v_claim jsonb;
BEGIN
  PERFORM pg_temp.act_as('d0000000-0000-4000-8000-000000000001');

  v_elig := public.get_trial_eligibility_for_current_user();
  PERFORM pg_temp.assert_true(v_elig = jsonb_build_object('eligible', true, 'reason', 'never_used'),
    'fresh owner must be eligible/never_used, got ' || v_elig::text);

  v_claim := public.claim_trial_for_current_user('e0000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true((v_claim ->> 'ok') = 'true' AND (v_claim ->> 'reason') = 'trial_claimed',
    'claim must succeed with trial_claimed, got ' || v_claim::text);
  PERFORM pg_temp.assert_true((v_claim ->> 'access_state') = 'trialing', 'claim access_state must be trialing');

  -- billing state
  PERFORM pg_temp.assert_true(EXISTS (
    SELECT 1 FROM public.billing_subscriptions bs JOIN public.plans p ON p.id = bs.plan_id
    WHERE bs.organization_id = 'e0000000-0000-4000-8000-000000000001'
      AND p.slug = 'trial' AND bs.status = 'trialing' AND bs.trial_ends_at > now()),
    'org A must have a trialing subscription with a future trial_ends_at');

  -- claim + identity rows exist with HMAC identity, no raw email
  PERFORM pg_temp.assert_true(EXISTS (
    SELECT 1 FROM public.billing_trial_claims
    WHERE user_id = 'd0000000-0000-4000-8000-000000000001' AND status = 'active'
      AND identity_hash = public.billing_identity_hash('ti-owner@example.test')
      AND identity_id IS NOT NULL),
    'active claim must carry HMAC identity_hash + identity_id');

  PERFORM pg_temp.assert_true(EXISTS (
    SELECT 1 FROM public.billing_identities
    WHERE identity_hash = public.billing_identity_hash('ti-owner@example.test')),
    'billing_identities registry row must exist');

  -- security event (billing.* → activity_type=security), no raw email in payload
  PERFORM pg_temp.assert_true(EXISTS (
    SELECT 1 FROM public.domain_events
    WHERE organization_id = 'e0000000-0000-4000-8000-000000000001'
      AND event_name = 'billing.trial.claimed' AND activity_type = 'security'
      AND NOT (payload::text ILIKE '%@example.test%')),
    'security event must be recorded without raw email');

  -- state RPC + eligibility now reflect the claim
  PERFORM pg_temp.assert_true(
    public.get_organization_access_state('e0000000-0000-4000-8000-000000000001') = 'trialing',
    'access state of org A must be trialing');
  PERFORM pg_temp.assert_true(
    (public.get_trial_eligibility_for_current_user() ->> 'reason') = 'trial_claimed',
    'after claim eligibility must be trial_claimed');
END $$;

-- ── Negative: same identity cannot claim a second organization ──────────────
DO $$
DECLARE v_claim jsonb;
BEGIN
  PERFORM pg_temp.act_as('d0000000-0000-4000-8000-000000000001');
  v_claim := public.claim_trial_for_current_user('e0000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.assert_true((v_claim ->> 'ok') = 'false' AND (v_claim ->> 'reason') = 'trial_already_used',
    'second org for same identity must be trial_already_used, got ' || v_claim::text);
  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.billing_trial_claims WHERE user_id = 'd0000000-0000-4000-8000-000000000001') = 1,
    'still exactly one claim per identity');
END $$;

-- ── Negative: init_trial_subscription denial path also updates for identity ──
DO $$
DECLARE v_result text;
BEGIN
  v_result := public.init_trial_subscription(
    'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(v_result = 'trial_denied',
    'init_trial_subscription for a used identity must be denied, got ' || v_result);
  PERFORM pg_temp.assert_true(public.is_organization_writable('e0000000-0000-4000-8000-000000000002') = false,
    'denied org B must be read-only');
END $$;

-- ── Negative: non-owner member cannot claim ─────────────────────────────────
DO $$
DECLARE v_claim jsonb;
BEGIN
  PERFORM pg_temp.act_as('d0000000-0000-4000-8000-000000000002');
  v_claim := public.claim_trial_for_current_user('e0000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true((v_claim ->> 'reason') = 'permission_denied',
    'member (non-owner) must be permission_denied, got ' || v_claim::text);
END $$;

-- ── Negative: unauthenticated is denied ─────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.act_as('');
  PERFORM pg_temp.assert_true(
    (public.get_trial_eligibility_for_current_user() ->> 'reason') = 'auth_required',
    'unauthenticated eligibility must be auth_required');
  PERFORM pg_temp.assert_true(
    (public.claim_trial_for_current_user('e0000000-0000-4000-8000-000000000004') ->> 'reason') = 'auth_required',
    'unauthenticated claim must be auth_required');
END $$;

-- ── Negative: unconfirmed email is denied ───────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.act_as('d0000000-0000-4000-8000-000000000004');
  PERFORM pg_temp.assert_true(
    (public.get_trial_eligibility_for_current_user() ->> 'reason') = 'verified_email_required',
    'unconfirmed email eligibility must be verified_email_required');
  PERFORM pg_temp.assert_true(
    (public.claim_trial_for_current_user('e0000000-0000-4000-8000-000000000004') ->> 'reason') = 'verified_email_required',
    'unconfirmed email claim must be verified_email_required');
END $$;

-- ── Developer unlimited: no trial needed, unlimited access state ─────────────
DO $$
BEGIN
  PERFORM pg_temp.act_as('d0000000-0000-4000-8000-000000000003');
  PERFORM pg_temp.assert_true(
    (public.get_trial_eligibility_for_current_user() ->> 'reason') = 'developer_unlimited',
    'dev-unlimited eligibility reason must be developer_unlimited');
  PERFORM pg_temp.assert_true(
    public.get_organization_access_state('e0000000-0000-4000-8000-000000000003') = 'developer_unlimited',
    'dev-unlimited access state must be developer_unlimited');
  PERFORM pg_temp.assert_true(
    public.can_write_org('e0000000-0000-4000-8000-000000000003') = true,
    'dev-unlimited must be able to write');
END $$;

-- ── Negative: expired trial cannot be reactivated ───────────────────────────
DO $$
DECLARE v_claim jsonb;
BEGIN
  -- Force org A's trial to expired + claim consumed.
  UPDATE public.billing_subscriptions SET status = 'expired', trial_ends_at = now() - INTERVAL '1 day'
  WHERE organization_id = 'e0000000-0000-4000-8000-000000000001';
  UPDATE public.billing_trial_claims SET status = 'consumed', trial_consumed_at = now()
  WHERE user_id = 'd0000000-0000-4000-8000-000000000001';

  PERFORM pg_temp.act_as('d0000000-0000-4000-8000-000000000001');
  v_claim := public.claim_trial_for_current_user('e0000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true((v_claim ->> 'reason') = 'trial_already_used',
    'expired/consumed trial must not be reactivated, got ' || v_claim::text);
  PERFORM pg_temp.assert_true(
    public.get_organization_access_state('e0000000-0000-4000-8000-000000000001') = 'trial_expired',
    'expired trial access state must be trial_expired');
END $$;

-- ── No raw email columns in identity / claim / security tables ──────────────
DO $$
BEGIN
  PERFORM pg_temp.assert_true(NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('billing_trial_claims', 'billing_identities')
      AND column_name = 'email'),
    'trial/identity tables must not have a raw email column');
END $$;

-- ── Race: unique constraints reject duplicate identity / organization ───────
DO $$
DECLARE v_hash text := public.billing_identity_hash('ti-owner@example.test');
BEGIN
  -- Duplicate identity_hash (the guarantee that two concurrent claims collapse
  -- to one — the loser hits unique_violation exactly like this).
  BEGIN
    INSERT INTO public.billing_trial_claims (user_id, normalized_email_hash, identity_hash)
    VALUES ('d0000000-0000-4000-8000-000000000002', public.normalized_email_hash('x@example.test'), v_hash);
    RAISE EXCEPTION 'trial_identity verification failed: duplicate identity_hash must be rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- Duplicate organization_id.
  BEGIN
    INSERT INTO public.billing_trial_claims (user_id, organization_id, normalized_email_hash, identity_hash)
    VALUES ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001',
            public.normalized_email_hash('y@example.test'), public.billing_identity_hash('y@example.test'));
    RAISE EXCEPTION 'trial_identity verification failed: duplicate organization_id must be rejected';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

DO $$ BEGIN RAISE NOTICE 'trial_identity_verification: ALL CHECKS PASSED'; END $$;

ROLLBACK;
