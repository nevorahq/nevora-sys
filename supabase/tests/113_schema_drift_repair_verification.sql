-- Migration 113 (schema drift repair) verification harness.
--
-- The drift this guards against was invisible to every existing check: the CI
-- `db` job applies all migrations from scratch, but only runs SQL harnesses as
-- role `postgres` — it never calls create_organization() nor the application
-- insert path, so a database that could not create an organization still went
-- green. This harness closes that gap by DOING the two things the app does.
--
-- Run only against local/test/staging databases: every write happens inside a
-- transaction that is rolled back.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/113_schema_drift_repair_verification.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ok THEN RAISE EXCEPTION 'ASSERTION FAILED: %', message; END IF;
  RAISE NOTICE 'ok — %', message;
END $$;

-- Mirrors Supabase auth.uid() resolution.
CREATE OR REPLACE FUNCTION pg_temp.set_uid(p_user TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.sub', p_user, true); END $$;

-- ---------------------------------------------------------------------------
-- 1. Column-level assertions (what 113 repairs)
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='workspaces' AND column_name='slug'
  ),
  'workspaces.slug exists — create_organization() writes it'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='money_accounts'
      AND column_name='user_id' AND is_nullable='NO'
  ),
  'money_accounts.user_id is absent or nullable — no code path sets it'
);

-- ---------------------------------------------------------------------------
-- 2. The real proof: the two writes the application actually performs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_user   UUID := '00000000-0000-4000-8000-0000000dd001';
  v_org    UUID;
  v_ws     UUID;
  v_acct   UUID;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'drift-harness@example.test', 'x', now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.set_uid(v_user::text);

  -- The first thing any new user does. Before 113 this raised
  -- "column slug of relation workspaces does not exist" on a rebuilt database.
  v_org := public.create_organization('Drift Harness Org', 'drift-harness-org', 'EUR');
  PERFORM pg_temp.assert_true(v_org IS NOT NULL, 'create_organization() returns an organization id');

  SELECT id INTO v_ws FROM public.workspaces
  WHERE organization_id = v_org AND is_default LIMIT 1;
  PERFORM pg_temp.assert_true(v_ws IS NOT NULL, 'create_organization() provisioned a default workspace');

  -- The onboarding default-account seed + every inline account creation.
  -- Before 113 this failed the user_id NOT NULL check on a rebuilt database.
  INSERT INTO public.money_accounts
    (organization_id, workspace_id, created_by, updated_by, name, type,
     initial_balance, currency, is_active)
  VALUES (v_org, v_ws, v_user, v_user, 'EUR account', 'cash', 0, 'EUR', true)
  RETURNING id INTO v_acct;
  PERFORM pg_temp.assert_true(v_acct IS NOT NULL, 'a money account inserts without user_id');
END $$;

ROLLBACK;
