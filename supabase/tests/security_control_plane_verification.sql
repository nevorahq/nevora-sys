-- Security Control Plane verification harness.
--
-- Run only against local/test/staging databases. The script creates disposable
-- rows inside a transaction and rolls them back.
--
-- Example:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/security_control_plane_verification.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'security_control_plane verification failed: %', message;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Catalog protections for provider boundary tables
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  (
    SELECT bool_and(c.relrowsecurity)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('billing_provider_mappings', 'billing_provider_events')
  ),
  'billing provider mapping/event tables must have RLS enabled'
);

SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'public.billing_provider_events', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.billing_provider_events', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.billing_provider_events', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.billing_provider_events', 'UPDATE'),
  'clients must not write billing provider audit/dedupe tables directly'
);

SELECT pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.apply_billing_provider_event(text,text,text,timestamp with time zone,text,text,uuid,text,text,text,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.apply_billing_provider_event(text,text,text,timestamp with time zone,text,text,uuid,text,text,text,jsonb)',
    'EXECUTE'
  ),
  'only the webhook service role may execute provider billing state transitions'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, slug, plan)
VALUES ('f1000000-0000-4000-8000-000000000001', 'Security TCP Org', 'security-tcp-org', 'trial');

INSERT INTO public.billing_subscriptions (
  organization_id,
  plan_id,
  status,
  billing_cycle,
  trial_ends_at,
  current_period_start,
  current_period_end
)
VALUES (
  'f1000000-0000-4000-8000-000000000001',
  (SELECT id FROM public.plans WHERE slug = 'trial' LIMIT 1),
  'expired',
  'monthly',
  now() - interval '1 day',
  now() - interval '14 days',
  now() - interval '1 day'
);

-- ---------------------------------------------------------------------------
-- Provider webhook is the paid activation boundary
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  (public.apply_billing_provider_event(
    'paddle',
    'evt_security_active',
    'subscription.updated',
    '2026-07-07T12:00:00Z',
    'cus_security',
    'sub_security',
    'f1000000-0000-4000-8000-000000000001',
    'pro',
    'monthly',
    'active',
    jsonb_build_object('email', 'owner@example.test', 'source', 'test')
  ) ->> 'ok') = 'true',
  'verified provider event must be able to activate a paid plan'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.billing_subscriptions bs
    JOIN public.plans p ON p.id = bs.plan_id
    WHERE bs.organization_id = 'f1000000-0000-4000-8000-000000000001'
      AND bs.status = 'active'
      AND p.slug = 'pro'
      AND bs.provider_customer_id = 'cus_security'
      AND bs.provider_subscription_id = 'sub_security'
  ),
  'provider webhook must update subscription mapping to the paid plan'
);

SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1
    FROM public.billing_provider_mappings
    WHERE organization_id = 'f1000000-0000-4000-8000-000000000001'
      AND provider = 'paddle'
      AND provider_customer_id = 'cus_security'
      AND provider_subscription_id = 'sub_security'
      AND is_active
  ),
  'provider customer/subscription mapping must be stored'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM public.billing_provider_events
    WHERE provider_event_id = 'evt_security_active'
      AND payload::text ILIKE '%owner@example.test%'
  ),
  'provider event audit payload must not retain raw email'
);

SELECT pg_temp.assert_true(
  (public.apply_billing_provider_event(
    'paddle',
    'evt_security_active',
    'subscription.updated',
    '2026-07-07T12:00:00Z',
    'cus_security',
    'sub_security',
    NULL,
    'pro',
    'monthly',
    'active',
    '{}'::jsonb
  ) ->> 'duplicate') = 'true',
  'duplicate provider event id must be idempotent'
);

SELECT pg_temp.assert_true(
  (public.apply_billing_provider_event(
    'paddle',
    'evt_security_old_cancel',
    'subscription.deleted',
    '2026-07-06T12:00:00Z',
    'cus_security',
    'sub_security',
    NULL,
    NULL,
    NULL,
    'canceled',
    '{}'::jsonb
  ) ->> 'ignored_reason') = 'out_of_order',
  'older provider events must be ignored safely'
);

SELECT pg_temp.assert_true(
  (
    SELECT status = 'active'
    FROM public.billing_subscriptions
    WHERE organization_id = 'f1000000-0000-4000-8000-000000000001'
  ),
  'out-of-order canceled event must not downgrade active subscription'
);

SELECT pg_temp.assert_true(
  (public.apply_billing_provider_event(
    'paddle',
    'evt_security_dev',
    'subscription.updated',
    '2026-07-08T12:00:00Z',
    'cus_security',
    'sub_security',
    NULL,
    'pro',
    'monthly',
    'developer_unlimited',
    '{}'::jsonb
  ) ->> 'ignored_reason') = 'invalid_status',
  'provider webhook must not grant developer_unlimited'
);

ROLLBACK;

SELECT 'security_control_plane verification passed' AS result;
