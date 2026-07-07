-- Analytics billing-aware writability — RLS verification (migration 093).
--
-- Proves the Phase 9 blocker is closed at the database boundary: a non-writable
-- (expired) organization cannot INSERT/UPDATE analytics rows even via a direct
-- Supabase/PostgREST call, while a writable organization still can.
--
-- Run only against a local/test/staging database. All fixtures roll back.
--
-- Example local command after `supabase db reset`:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/analytics_writability_verification.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'Analytics writability verification failed: %', message; END IF; END $$;

-- Mirrors Supabase auth.uid() resolution.
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', p_user::text, true); END $$;

-- ── Fixtures (as superuser: RLS bypassed for setup) ──────────────────────────
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('a9300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'an-writable-admin@example.test', 'x', now(), now(), now()),
  ('a9300000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'an-expired-admin@example.test',  'x', now(), now(), now());

-- Writable org: no billing subscription row → is_organization_writable() = TRUE.
INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('b9300000-0000-4000-8000-000000000001', 'Analytics Writable Org', 'an-writable-org-093', 'free');

-- Expired org: a non-trial subscription in status 'expired' → not writable.
INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('b9300000-0000-4000-8000-000000000002', 'Analytics Expired Org', 'an-expired-org-093', 'pro');

INSERT INTO public.billing_subscriptions (organization_id, plan_id, status)
SELECT 'b9300000-0000-4000-8000-000000000002',
       (SELECT id FROM public.plans WHERE slug <> 'trial' ORDER BY slug LIMIT 1),
       'expired';

INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('a9300000-0000-4000-8000-000000000001', 'b9300000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('a9300000-0000-4000-8000-000000000002', 'b9300000-0000-4000-8000-000000000002', 'admin', 'active');

-- Pre-seed one row per analytics table in the EXPIRED org, so UPDATE-denial can
-- be checked against existing rows.
INSERT INTO public.analytics_widgets (id, organization_id, created_by, name, widget_type, data_source) VALUES
  ('c9300000-0000-4000-8000-000000000001', 'b9300000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000002', 'W', 'kpi_card', 'tasks');
INSERT INTO public.analytics_reports (id, organization_id, created_by, name, report_type) VALUES
  ('c9300000-0000-4000-8000-000000000002', 'b9300000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000002', 'R', 'custom');
INSERT INTO public.analytics_snapshots (id, organization_id, snapshot_date, period_type) VALUES
  ('c9300000-0000-4000-8000-000000000003', 'b9300000-0000-4000-8000-000000000002', current_date, 'daily');

-- Sanity: helper agrees the expired org is not writable.
SELECT pg_temp.assert_true(public.is_organization_writable('b9300000-0000-4000-8000-000000000002') = false,
  'expired org must be non-writable');

-- Ensure the base table privileges exist so the ONLY thing standing between the
-- authenticated role and a write is the RLS policy (Supabase grants these
-- automatically on hosted projects; a bare psql instance may not). Rolled back
-- with the surrounding transaction.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.analytics_reports, public.analytics_widgets, public.analytics_snapshots
  TO authenticated;

SET LOCAL ROLE authenticated;

-- ── EXPIRED org: every write must be blocked by RLS ──────────────────────────
SELECT pg_temp.act_as('a9300000-0000-4000-8000-000000000002');

-- INSERT analytics_reports → RLS must reject.
DO $$
BEGIN
  INSERT INTO public.analytics_reports (organization_id, created_by, name, report_type)
  VALUES ('b9300000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000002', 'X', 'custom');
  RAISE EXCEPTION 'Analytics writability verification failed: expired org must NOT insert a report';
EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected: RLS denial
END $$;

-- INSERT analytics_snapshots → RLS must reject.
DO $$
BEGIN
  INSERT INTO public.analytics_snapshots (organization_id, snapshot_date, period_type)
  VALUES ('b9300000-0000-4000-8000-000000000002', current_date + 1, 'daily');
  RAISE EXCEPTION 'Analytics writability verification failed: expired org must NOT insert a snapshot';
EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
END $$;

-- INSERT analytics_widgets → RLS must reject.
DO $$
BEGIN
  INSERT INTO public.analytics_widgets (organization_id, created_by, name, widget_type, data_source)
  VALUES ('b9300000-0000-4000-8000-000000000002', 'a9300000-0000-4000-8000-000000000002', 'X', 'kpi_card', 'tasks');
  RAISE EXCEPTION 'Analytics writability verification failed: expired org must NOT insert a widget';
EXCEPTION WHEN insufficient_privilege THEN NULL; -- expected
END $$;

-- UPDATE existing rows → USING now includes can_write_data → 0 rows affected.
DO $$
DECLARE v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.analytics_widgets SET name = 'hacked'
    WHERE id = 'c9300000-0000-4000-8000-000000000001' RETURNING 1
  ) SELECT count(*) INTO v_count FROM upd;
  PERFORM pg_temp.assert_true(v_count = 0, 'expired org must NOT update a widget');

  WITH upd AS (
    UPDATE public.analytics_snapshots SET tasks_total = 999
    WHERE id = 'c9300000-0000-4000-8000-000000000003' RETURNING 1
  ) SELECT count(*) INTO v_count FROM upd;
  PERFORM pg_temp.assert_true(v_count = 0, 'expired org must NOT update a snapshot');

  WITH upd AS (
    UPDATE public.analytics_reports SET name = 'hacked'
    WHERE id = 'c9300000-0000-4000-8000-000000000002' RETURNING 1
  ) SELECT count(*) INTO v_count FROM upd;
  PERFORM pg_temp.assert_true(v_count = 0, 'expired org must NOT update a report');
END $$;

-- Expired org can still READ its analytics (read policies unchanged).
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.analytics_widgets WHERE id = 'c9300000-0000-4000-8000-000000000001'),
  'expired org must still be able to read its widgets');

-- ── WRITABLE org: valid writes still succeed ─────────────────────────────────
SELECT pg_temp.act_as('a9300000-0000-4000-8000-000000000001');

DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.analytics_reports (organization_id, created_by, name, report_type)
  VALUES ('b9300000-0000-4000-8000-000000000001', 'a9300000-0000-4000-8000-000000000001', 'Valid', 'custom')
  RETURNING id INTO v_id;
  PERFORM pg_temp.assert_true(v_id IS NOT NULL, 'writable org must create a report');

  INSERT INTO public.analytics_widgets (organization_id, created_by, name, widget_type, data_source)
  VALUES ('b9300000-0000-4000-8000-000000000001', 'a9300000-0000-4000-8000-000000000001', 'Valid', 'kpi_card', 'tasks')
  RETURNING id INTO v_id;
  PERFORM pg_temp.assert_true(v_id IS NOT NULL, 'writable org must create a widget');

  INSERT INTO public.analytics_snapshots (organization_id, snapshot_date, period_type)
  VALUES ('b9300000-0000-4000-8000-000000000001', current_date, 'daily')
  RETURNING id INTO v_id;
  PERFORM pg_temp.assert_true(v_id IS NOT NULL, 'writable org must create a snapshot');
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'Analytics writability verification passed.'; END $$;

ROLLBACK;
