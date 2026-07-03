-- Phase 6.2 RLS/RPC verification harness.
--
-- Run only against local/test/staging databases. The script creates disposable
-- rows inside a transaction and rolls them back.
--
-- Example local command after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/phase6_rls_rpc_verification.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Phase 6.1 verification failed: %', message;
  END IF;
END;
$$;

CREATE TEMP TABLE phase6_ids (
  key text PRIMARY KEY,
  id uuid NOT NULL
) ON COMMIT DROP;

GRANT SELECT ON phase6_ids TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_track_rejected(
  p_api_key_id uuid,
  p_key_hash text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  PERFORM public.track_developer_api_usage(
    p_api_key_id,
    p_key_hash,
    date_trunc('month', now()),
    date_trunc('month', now()) + interval '1 month',
    date_trunc('minute', now()),
    date_trunc('minute', now()) + interval '1 minute'
  );
  RAISE EXCEPTION 'Phase 6.1 verification failed: %', p_message;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'Phase 6.1 verification failed:%' THEN
      RAISE;
    END IF;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.expect_track_rejected(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION pg_temp.expect_reserve_rejected(
  p_organization_id uuid,
  p_key text,
  p_increment numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  PERFORM public.reserve_organization_usage(p_organization_id, p_key, p_increment);
  RAISE EXCEPTION 'Phase 6.2 verification failed: %', p_message;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'Phase 6.2 verification failed:%' THEN
      RAISE;
    END IF;
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.expect_reserve_rejected(uuid, text, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Catalog/RLS/view/grant checks
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  (
    SELECT bool_and(c.relrowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'plan_entitlements',
        'plan_limits',
        'organization_usage_counters',
        'developer_api_keys',
        'developer_webhooks',
        'developer_webhook_deliveries',
        'billing_subscriptions',
        'plans'
      )
  ),
  'RLS must be enabled on Phase 6 tables and billing source tables'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'organization_subscriptions'
      AND 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::text[]))
  ),
  'organization_subscriptions must use security_invoker=true'
);

SELECT pg_temp.assert_true(
  pg_get_viewdef('public.organization_subscriptions'::regclass, true) LIKE '%billing_subscriptions%',
  'organization_subscriptions must read from billing_subscriptions'
);

SELECT pg_temp.assert_true(
  has_table_privilege('authenticated', 'public.organization_subscriptions', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.organization_subscriptions', 'SELECT'),
  'organization_subscriptions must be authenticated-only'
);

SELECT pg_temp.assert_true(
  NOT has_table_privilege('anon', 'public.developer_api_keys', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.developer_webhooks', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.organization_usage_counters', 'SELECT'),
  'tenant-scoped Phase 6 tables must not grant anon SELECT'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.increment_organization_usage_counter(uuid,text,numeric,timestamp with time zone,timestamp with time zone)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.reserve_organization_usage(uuid,text,numeric)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.release_organization_usage(uuid,text,numeric)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_plan_limit_for_organization(uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_organization_usage_counter_value(uuid,text,timestamp with time zone)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.validate_developer_api_key(text)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.get_developer_api_rate_state(uuid,text,timestamp with time zone)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.track_developer_api_usage(uuid,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)', 'EXECUTE'),
  'only key-proving API-key RPCs may be anon executable'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.document_attachments'::regclass
      AND tgname = 'phase6_storage_bytes_limit'
      AND NOT tgisinternal
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.document_attachments'::regclass
      AND tgname = 'start_limit_attachments'
      AND NOT tgisinternal
  ),
  'attachment storage enforcement must use the Phase 6 storage.bytes trigger'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'validate_developer_api_key',
        'mark_developer_api_key_used',
        'increment_organization_usage_counter',
        'get_plan_limit_for_organization',
        'get_organization_usage_counter_value',
        'get_developer_api_rate_state',
        'track_developer_api_usage'
      )
      AND NOT ('public' = ANY(p.proconfig) OR array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), ',') LIKE '%search_path=public, pg_catalog%')
  ),
  'Phase 6 RPCs must set an explicit search_path'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('organization_usage_counters', 'developer_api_keys', 'developer_webhooks')
      AND cmd IN ('INSERT', 'UPDATE', 'ALL')
      AND with_check IS NULL
  ),
  'INSERT/UPDATE/ALL policies must have WITH CHECK'
);

-- ---------------------------------------------------------------------------
-- Disposable fixture data
-- ---------------------------------------------------------------------------
INSERT INTO phase6_ids(key, id) VALUES
  ('user_a', '10000000-0000-4000-8000-00000000000a'),
  ('user_b', '10000000-0000-4000-8000-00000000000b'),
  ('org_a',  '20000000-0000-4000-8000-00000000000a'),
  ('org_b',  '20000000-0000-4000-8000-00000000000b');

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ((SELECT id FROM phase6_ids WHERE key = 'user_a'), 'authenticated', 'authenticated', 'phase6-a@example.test', 'x', now(), now(), now()),
  ((SELECT id FROM phase6_ids WHERE key = 'user_b'), 'authenticated', 'authenticated', 'phase6-b@example.test', 'x', now(), now(), now());

INSERT INTO public.organizations (id, name, slug, plan)
VALUES
  ((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'Phase 6 Org A', 'phase6-org-a', 'pro'),
  ((SELECT id FROM phase6_ids WHERE key = 'org_b'), 'Phase 6 Org B', 'phase6-org-b', 'business');

INSERT INTO public.memberships (user_id, organization_id, role, status)
VALUES
  ((SELECT id FROM phase6_ids WHERE key = 'user_a'), (SELECT id FROM phase6_ids WHERE key = 'org_a'), 'owner', 'active'),
  ((SELECT id FROM phase6_ids WHERE key = 'user_b'), (SELECT id FROM phase6_ids WHERE key = 'org_b'), 'owner', 'active');

INSERT INTO public.workspaces (organization_id, name, type, is_default)
VALUES
  ((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'General', 'default', true),
  ((SELECT id FROM phase6_ids WHERE key = 'org_b'), 'General', 'default', true);

INSERT INTO public.billing_subscriptions (
  organization_id,
  plan_id,
  status,
  billing_cycle,
  current_period_start,
  current_period_end,
  trial_ends_at,
  trial_start,
  trial_end
)
VALUES
  ((SELECT id FROM phase6_ids WHERE key = 'org_a'), (SELECT id FROM public.plans WHERE code = 'pro'), 'active', 'monthly', now(), now() + interval '1 month', NULL, NULL, NULL),
  ((SELECT id FROM phase6_ids WHERE key = 'org_b'), (SELECT id FROM public.plans WHERE code = 'business'), 'active', 'monthly', now(), now() + interval '1 month', NULL, NULL, NULL);

INSERT INTO public.developer_api_keys (
  id, organization_id, name, key_hash, key_prefix, scopes, created_by, expires_at, revoked_at
)
VALUES
  ('30000000-0000-4000-8000-00000000000a', (SELECT id FROM phase6_ids WHERE key = 'org_a'), 'pro active', repeat('a', 64), 'nva_live_pro', ARRAY['tasks:read'], (SELECT id FROM phase6_ids WHERE key = 'user_a'), NULL, NULL),
  ('30000000-0000-4000-8000-00000000000b', (SELECT id FROM phase6_ids WHERE key = 'org_b'), 'business active', repeat('b', 64), 'nva_live_business', ARRAY['tasks:read'], (SELECT id FROM phase6_ids WHERE key = 'user_b'), NULL, NULL),
  ('30000000-0000-4000-8000-00000000000c', (SELECT id FROM phase6_ids WHERE key = 'org_a'), 'revoked', repeat('c', 64), 'nva_live_revoked', ARRAY['tasks:read'], (SELECT id FROM phase6_ids WHERE key = 'user_a'), NULL, now()),
  ('30000000-0000-4000-8000-00000000000d', (SELECT id FROM phase6_ids WHERE key = 'org_a'), 'expired', repeat('d', 64), 'nva_live_expired', ARRAY['tasks:read'], (SELECT id FROM phase6_ids WHERE key = 'user_a'), now() - interval '1 day', NULL);

INSERT INTO public.developer_webhooks (id, organization_id, url, secret_hash, events, created_by)
VALUES
  ('40000000-0000-4000-8000-00000000000a', (SELECT id FROM phase6_ids WHERE key = 'org_a'), 'https://example.test/a', repeat('1', 64), ARRAY['task.created'], (SELECT id FROM phase6_ids WHERE key = 'user_a')),
  ('40000000-0000-4000-8000-00000000000b', (SELECT id FROM phase6_ids WHERE key = 'org_b'), 'https://example.test/b', repeat('2', 64), ARRAY['task.created'], (SELECT id FROM phase6_ids WHERE key = 'user_b'));

INSERT INTO public.developer_webhook_deliveries (webhook_id, status)
VALUES
  ('40000000-0000-4000-8000-00000000000a', 'pending'),
  ('40000000-0000-4000-8000-00000000000b', 'pending');

-- ---------------------------------------------------------------------------
-- Cross-tenant RLS checks
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM phase6_ids WHERE key = 'user_a'), true);

SELECT pg_temp.assert_true((SELECT count(*) FROM public.organization_subscriptions) = 1, 'user A must see only org A subscription view rows');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.developer_api_keys) = 3, 'user A must see only org A API keys');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.developer_webhooks) = 1, 'user A must see only org A webhooks');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.developer_webhook_deliveries) = 1, 'user A must see only org A webhook deliveries');

SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM phase6_ids WHERE key = 'user_b'), true);

SELECT pg_temp.assert_true((SELECT count(*) FROM public.organization_subscriptions) = 1, 'user B must see only org B subscription view rows');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.developer_api_keys) = 1, 'user B must see only org B API keys');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.developer_webhooks) = 1, 'user B must see only org B webhooks');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.developer_webhook_deliveries) = 1, 'user B must see only org B webhook deliveries');

-- Authenticated generic usage RPCs must enforce membership.
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM phase6_ids WHERE key = 'user_a'), true);
SELECT pg_temp.assert_true(
  public.get_plan_limit_for_organization((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'api_requests.monthly', 'monthly') IS NOT NULL,
  'user A can resolve own org plan limit'
);
SELECT pg_temp.assert_true(
  public.get_plan_limit_for_organization((SELECT id FROM phase6_ids WHERE key = 'org_b'), 'api_requests.monthly', 'monthly') IS NULL,
  'user A cannot resolve org B plan limit'
);

SELECT public.increment_organization_usage_counter((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'developer_api_keys.count', 1, NULL, NULL);
SELECT public.increment_organization_usage_counter((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'developer_api_keys.count', 1, NULL, NULL);
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1 AND max(value) = 2
    FROM public.organization_usage_counters
    WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a')
      AND key = 'developer_api_keys.count'
  ),
  'lifetime counters must upsert into one row'
);

-- Phase 6.2 product reservations serialize on the lifetime counter row. A
-- second reservation cannot pass a limit of one, and a compensated failure
-- restores capacity without creating another lifetime row.
RESET ROLE;

UPDATE public.plan_limits
SET value = 1
WHERE plan_id = (SELECT plan_id FROM public.billing_subscriptions WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a'))
  AND key = 'tasks.count'
  AND period = 'lifetime';

DELETE FROM public.organization_usage_counters
WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a')
  AND key = 'tasks.count';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM phase6_ids WHERE key = 'user_a'), true);

SELECT pg_temp.assert_true(
  public.reserve_organization_usage((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'tasks.count', 1) = 1,
  'atomic reservation must allow usage under the plan limit'
);
SELECT pg_temp.expect_reserve_rejected(
  (SELECT id FROM phase6_ids WHERE key = 'org_a'),
  'tasks.count',
  1,
  'atomic reservation must reject usage over the plan limit'
);
SELECT pg_temp.assert_true(
  public.release_organization_usage((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'tasks.count', 1) = 0,
  'failed create compensation must restore reserved capacity'
);
SELECT pg_temp.assert_true(
  (
    SELECT count(*) = 1 AND max(value) = 0
    FROM public.organization_usage_counters
    WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a')
      AND key = 'tasks.count'
  ),
  'repeated lifetime reservation usage must retain one counter row'
);

RESET ROLE;

UPDATE public.plan_limits
SET value = NULL
WHERE plan_id = (SELECT plan_id FROM public.billing_subscriptions WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a'))
  AND key = 'tasks.count'
  AND period = 'lifetime';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM phase6_ids WHERE key = 'user_a'), true);

SELECT pg_temp.assert_true(
  public.reserve_organization_usage((SELECT id FROM phase6_ids WHERE key = 'org_a'), 'tasks.count', 10) = 10,
  'NULL plan limit must allow unlimited usage'
);

SELECT pg_temp.expect_reserve_rejected(
  (SELECT id FROM phase6_ids WHERE key = 'org_b'),
  'tasks.count',
  1,
  'reservation must reject a cross-tenant organization id'
);

RESET ROLE;

-- ---------------------------------------------------------------------------
-- API key validation and key-proving anon RPCs
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

SELECT pg_temp.assert_true((SELECT count(*) FROM public.validate_developer_api_key(NULL)) = 0, 'missing key hash must reject');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.validate_developer_api_key(repeat('f', 64))) = 0, 'unknown key hash must reject');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.validate_developer_api_key(repeat('c', 64))) = 0, 'revoked key must reject');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.validate_developer_api_key(repeat('d', 64))) = 0, 'expired key must reject');
SELECT pg_temp.assert_true((SELECT rejection_reason IS NULL FROM public.validate_developer_api_key(repeat('a', 64))), 'Pro key must validate');
SELECT pg_temp.assert_true((SELECT rejection_reason IS NULL FROM public.validate_developer_api_key(repeat('b', 64))), 'Business key must validate');
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.validate_developer_api_key(repeat('a', 64)) v
    WHERE to_jsonb(v) ? 'key_hash'
       OR to_jsonb(v) ? 'provider_customer_id'
       OR to_jsonb(v) ? 'provider_subscription_id'
  ),
  'validation RPC must not expose key hash or billing provider IDs'
);

RESET ROLE;

-- Start plan is a real key but public API forbidden.
UPDATE public.billing_subscriptions
SET plan_id = (SELECT id FROM public.plans WHERE code = 'start')
WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a');

SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(
  (SELECT rejection_reason = 'developer_access_required' FROM public.validate_developer_api_key(repeat('a', 64))),
  'Start plan key must be forbidden for public API'
);
RESET ROLE;

UPDATE public.billing_subscriptions
SET plan_id = (SELECT id FROM public.plans WHERE code = 'pro')
WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a');

UPDATE public.plan_entitlements
SET value = 'false'::jsonb
WHERE plan_id = (SELECT id FROM public.plans WHERE code = 'pro')
  AND key = 'public_api.enabled';

SET LOCAL ROLE anon;
SELECT pg_temp.assert_true(
  (SELECT rejection_reason = 'public_api_required' FROM public.validate_developer_api_key(repeat('a', 64))),
  'public_api.enabled=false must forbid public API'
);
RESET ROLE;

UPDATE public.plan_entitlements
SET value = 'true'::jsonb
WHERE plan_id = (SELECT id FROM public.plans WHERE code = 'pro')
  AND key = 'public_api.enabled';

-- Atomic usage tracking: guessed id rejects; first allowed; second over minute limit rejects and does not increment.
UPDATE public.plan_limits
SET value = 2
WHERE plan_id = (SELECT id FROM public.plans WHERE code = 'pro')
  AND key = 'api_requests.monthly';

UPDATE public.plan_limits
SET value = 1
WHERE plan_id = (SELECT id FROM public.plans WHERE code = 'pro')
  AND key = 'api_requests.minute';

SET LOCAL ROLE anon;
SELECT pg_temp.expect_track_rejected('99999999-0000-4000-8000-000000000000', repeat('a', 64), 'guessed API key id must reject');

SELECT public.track_developer_api_usage(
  '30000000-0000-4000-8000-00000000000a',
  repeat('a', 64),
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month',
  date_trunc('minute', now()),
  date_trunc('minute', now()) + interval '1 minute'
);

SELECT pg_temp.expect_track_rejected('30000000-0000-4000-8000-00000000000a', repeat('a', 64), 'over-limit API usage must reject');
RESET ROLE;

SELECT pg_temp.assert_true(
  (
    SELECT value = 1
    FROM public.organization_usage_counters
    WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a')
      AND key = 'api_requests.minute'
      AND period_start = date_trunc('minute', now())
  ),
  'over-limit API tracking must not increment counter'
);

-- ---------------------------------------------------------------------------
-- Trial/subscription writability
-- ---------------------------------------------------------------------------
UPDATE public.billing_subscriptions
SET plan_id = (SELECT id FROM public.plans WHERE code = 'trial'),
    status = 'trialing',
    trial_ends_at = now() + interval '1 day',
    current_period_end = now() + interval '1 day'
WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM phase6_ids WHERE key = 'user_a'), true);
SELECT pg_temp.assert_true(public.is_organization_writable((SELECT id FROM phase6_ids WHERE key = 'org_a')), 'future trial must be writable');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.organization_subscriptions) = 1, 'trial read access must remain available');
RESET ROLE;

UPDATE public.billing_subscriptions
SET trial_ends_at = now() - interval '1 day',
    current_period_end = now() - interval '1 day'
WHERE organization_id = (SELECT id FROM phase6_ids WHERE key = 'org_a');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM phase6_ids WHERE key = 'user_a'), true);
SELECT pg_temp.assert_true(NOT public.is_organization_writable((SELECT id FROM phase6_ids WHERE key = 'org_a')), 'expired trial must block writes');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.organization_subscriptions) = 1, 'expired trial read access must remain available');
RESET ROLE;

ROLLBACK;

SELECT 'Phase 6.2 RLS/RPC verification passed' AS result;
