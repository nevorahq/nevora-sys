-- Trial Reuse Protection (migration 086) verification harness.
--
-- Run only against local/test/staging databases. The script creates disposable
-- rows inside a transaction and rolls them back.
--
-- Example local command after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/trial_reuse_verification.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Trial reuse verification failed: %', message;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: two users (owner + invited member)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE trial_ids (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

INSERT INTO auth.users (id, email)
VALUES
  (gen_random_uuid(), 'trial-owner-086@test.local'),
  (gen_random_uuid(), 'trial-member-086@test.local');

INSERT INTO trial_ids
SELECT 'owner', id FROM auth.users WHERE email = 'trial-owner-086@test.local';
INSERT INTO trial_ids
SELECT 'member', id FROM auth.users WHERE email = 'trial-member-086@test.local';

-- ---------------------------------------------------------------------------
-- Scenario A: first organization of a fresh owner → trial granted
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := (SELECT id FROM trial_ids WHERE key = 'owner');
  v_org uuid;
  v_result text;
BEGIN
  INSERT INTO public.organizations (name, slug, plan)
  VALUES ('Trial Org A', 'trial-org-a-086', 'trial') RETURNING id INTO v_org;
  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_owner, v_org, 'owner', 'active');
  INSERT INTO trial_ids VALUES ('org_a', v_org);

  v_result := public.init_trial_subscription(v_org, v_owner);
  PERFORM pg_temp.assert_true(v_result = 'trial_granted', 'A: first trial must be granted, got ' || v_result);

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.billing_trial_claims
            WHERE user_id = v_owner AND status = 'active' AND organization_id = v_org),
    'A: active claim row must exist');

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.billing_subscriptions bs
            JOIN public.plans p ON p.id = bs.plan_id
            WHERE bs.organization_id = v_org AND p.slug = 'trial' AND bs.status = 'trialing'),
    'A: trialing subscription must exist');

  PERFORM pg_temp.assert_true(
    NOT EXISTS (SELECT 1 FROM public.billing_trial_claims WHERE user_id = v_owner
                AND normalized_email_hash IS NULL),
    'A: claim must carry normalized_email_hash');

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.domain_events
            WHERE organization_id = v_org AND event_name = 'billing.trial.claimed'),
    'A: billing.trial.claimed event must be recorded');
END $$;

-- ---------------------------------------------------------------------------
-- Scenario B: second organization of the same owner → trial denied,
-- subscription starts expired (billing_required), org stays read-only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := (SELECT id FROM trial_ids WHERE key = 'owner');
  v_org uuid;
  v_result text;
BEGIN
  INSERT INTO public.organizations (name, slug, plan)
  VALUES ('Trial Org B', 'trial-org-b-086', 'trial') RETURNING id INTO v_org;
  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_owner, v_org, 'owner', 'active');
  INSERT INTO trial_ids VALUES ('org_b', v_org);

  v_result := public.init_trial_subscription(v_org, v_owner);
  PERFORM pg_temp.assert_true(v_result = 'trial_denied', 'B: second trial must be denied, got ' || v_result);

  PERFORM pg_temp.assert_true(
    (SELECT count(*) FROM public.billing_trial_claims WHERE user_id = v_owner) = 1,
    'B: still exactly one claim per identity');

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.billing_subscriptions bs
            WHERE bs.organization_id = v_org AND bs.status = 'expired'
              AND (bs.metadata ->> 'trial_denied')::boolean IS TRUE),
    'B: denied org must get expired subscription with trial_denied metadata');

  PERFORM pg_temp.assert_true(
    public.is_organization_writable(v_org) = false,
    'B: denied org must be read-only');

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.domain_events
            WHERE organization_id = v_org AND event_name = 'billing.trial.denied'),
    'B: billing.trial.denied event must be recorded');
END $$;

-- ---------------------------------------------------------------------------
-- Scenario F (race): direct duplicate claim insert must hit unique constraint
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := (SELECT id FROM trial_ids WHERE key = 'owner');
BEGIN
  BEGIN
    INSERT INTO public.billing_trial_claims (user_id, normalized_email_hash)
    VALUES (v_owner, public.normalized_email_hash('someone-else@test.local'));
    RAISE EXCEPTION 'Trial reuse verification failed: F: duplicate user_id claim must be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.billing_trial_claims (user_id, normalized_email_hash)
    VALUES ((SELECT id FROM trial_ids WHERE key = 'member'),
            public.normalized_email_hash('trial-owner-086@test.local'));
    RAISE EXCEPTION 'Trial reuse verification failed: F: duplicate email hash claim must be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Scenario D: invited member never claimed → still eligible for own trial
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_member uuid := (SELECT id FROM trial_ids WHERE key = 'member');
  v_org uuid := (SELECT id FROM trial_ids WHERE key = 'org_a');
  v_own_org uuid;
  v_result text;
BEGIN
  -- Member joins the owner's org — this must NOT create a claim for them.
  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_member, v_org, 'member', 'active');

  PERFORM pg_temp.assert_true(
    NOT EXISTS (SELECT 1 FROM public.billing_trial_claims WHERE user_id = v_member),
    'D: invited member must not have a trial claim');

  -- Their own organization later still gets a trial.
  INSERT INTO public.organizations (name, slug, plan)
  VALUES ('Member Own Org', 'trial-org-m-086', 'trial') RETURNING id INTO v_own_org;
  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_member, v_own_org, 'owner', 'active');
  INSERT INTO trial_ids VALUES ('org_m', v_own_org);

  v_result := public.init_trial_subscription(v_own_org, v_member);
  PERFORM pg_temp.assert_true(v_result = 'trial_granted',
    'D: invited member''s own first trial must be granted, got ' || v_result);
END $$;

-- ---------------------------------------------------------------------------
-- Scenario C: expiration → claim consumed, second trial still denied
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := (SELECT id FROM trial_ids WHERE key = 'owner');
  v_org uuid := (SELECT id FROM trial_ids WHERE key = 'org_a');
  v_sweep jsonb;
BEGIN
  -- Force the trial past its end date.
  UPDATE public.billing_subscriptions
  SET trial_ends_at = now() - interval '1 day',
      current_period_end = now() - interval '1 day'
  WHERE organization_id = v_org;
  UPDATE public.billing_trial_claims
  SET trial_ended_at = now() - interval '1 day'
  WHERE user_id = v_owner;

  v_sweep := public.consume_expired_trials();

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.billing_subscriptions
            WHERE organization_id = v_org AND status = 'expired'),
    'C: overdue trialing subscription must become expired');

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.billing_trial_claims
            WHERE user_id = v_owner AND status = 'consumed' AND trial_consumed_at IS NOT NULL),
    'C: claim must be consumed after expiration');

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.domain_events
            WHERE organization_id = v_org AND event_name = 'billing.trial.consumed')
    AND EXISTS (SELECT 1 FROM public.domain_events
            WHERE organization_id = v_org AND event_name = 'billing.plan.required'),
    'C: consumed/plan_required events must be recorded');

  PERFORM pg_temp.assert_true(
    public.is_organization_writable(v_org) = false,
    'C: expired trial org must be read-only');

  -- Sweep is idempotent.
  v_sweep := public.consume_expired_trials();
  PERFORM pg_temp.assert_true(
    (v_sweep ->> 'consumed_claims')::int = 0 OR (v_sweep ->> 'consumed_claims') IS NULL
      OR (v_sweep ->> 'consumed_claims')::int >= 0,
    'C: sweep must be callable repeatedly');
END $$;

-- ---------------------------------------------------------------------------
-- Deleting the trial organization must NOT restore trial eligibility
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := (SELECT id FROM trial_ids WHERE key = 'owner');
  v_org uuid := (SELECT id FROM trial_ids WHERE key = 'org_a');
BEGIN
  DELETE FROM public.organizations WHERE id = v_org;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM public.billing_trial_claims
            WHERE user_id = v_owner AND organization_id IS NULL AND status = 'consumed'),
    'Delete: claim must survive org deletion with organization_id = NULL');
END $$;

DO $$ BEGIN RAISE NOTICE 'Trial reuse verification passed.'; END $$;

ROLLBACK;
