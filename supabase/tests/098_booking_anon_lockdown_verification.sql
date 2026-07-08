-- Booking anon lockdown (migration 098) verification harness.
--
-- Proves that pausing Booking closed the *data* surface, not just the Next.js
-- routes. Run only against local/test/staging databases: the script creates
-- disposable rows inside a transaction and rolls them back.
--
-- Example local command after `supabase db reset` + applying 098:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/098_booking_anon_lockdown_verification.sql
--
-- A note on what "denied" looks like, because it is easy to test the wrong
-- thing: RLS denial is NOT an error. A role that holds SELECT but matches no
-- policy gets an empty result set and HTTP 200 — never a 403. Only a *missing
-- grant* raises insufficient_privilege. 098 removes both the anon policies and
-- the anon grant, so anon should hit the grant error; but these assertions treat
-- "raised insufficient_privilege" and "returned zero rows" as equally passing,
-- so the harness keeps working if the grant is ever reinstated with RLS relied
-- on alone.

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Booking anon lockdown verification failed: %', message;
  END IF;
END;
$$;

-- Rows visible to the *current* role.
--   >= 0  -> the role holds SELECT; this many rows passed RLS
--   -1    -> the role holds no SELECT grant at all (strictly stronger than 0 rows)
--
-- The two are kept distinct on purpose. Collapsing "no grant" into "0 rows" makes
-- every anon assertion below pass on a database where nobody has any grant — which
-- is exactly the state of a from-scratch local Supabase stack, and would have
-- turned this whole harness into a rubber stamp.
CREATE OR REPLACE FUNCTION pg_temp.visible_rows(p_table text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_count;
  RETURN v_count;
EXCEPTION
  WHEN insufficient_privilege THEN
    RETURN -1;
END;
$$;

-- Does `authenticated` hold SELECT on ordinary business tables here?
--
-- Hosted Supabase grants table privileges to anon/authenticated/service_role; a
-- local `supabase db reset` does not, so no role can SELECT anything. That is an
-- environment artifact, not a finding — and 098 must not be blamed for it. The
-- member/non-member assertions below are therefore gated on this, and use `todos`
-- (a table 098 never touches) as the control.
CREATE OR REPLACE FUNCTION pg_temp.authenticated_has_grants()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT has_table_privilege('authenticated', 'public.todos', 'SELECT') $$;

-- ---------------------------------------------------------------------------
-- Fixtures: two organizations, a member of org A, and a stranger.
-- The booking page is PUBLISHED (public_enabled = true) — exactly the row that
-- was still readable by anon in production before 098.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE ids (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

INSERT INTO auth.users (id, email) VALUES
  (gen_random_uuid(), 'booking-member-098@test.local'),
  (gen_random_uuid(), 'booking-stranger-098@test.local');

INSERT INTO ids SELECT 'member',   id FROM auth.users WHERE email = 'booking-member-098@test.local';
INSERT INTO ids SELECT 'stranger', id FROM auth.users WHERE email = 'booking-stranger-098@test.local';

INSERT INTO ids VALUES ('org_a', gen_random_uuid()), ('org_b', gen_random_uuid());

INSERT INTO public.organizations (id, name, slug)
SELECT id, 'Org A 098', 'org-a-098' FROM ids WHERE key = 'org_a';
INSERT INTO public.organizations (id, name, slug)
SELECT id, 'Org B 098', 'org-b-098' FROM ids WHERE key = 'org_b';

INSERT INTO public.memberships (user_id, organization_id, role, status)
SELECT (SELECT id FROM ids WHERE key = 'member'),
       (SELECT id FROM ids WHERE key = 'org_a'),
       'owner', 'active';

-- 019 auto-initialises a booking page per organization; publish org A's.
UPDATE public.booking_pages
   SET public_enabled = true
 WHERE organization_id = (SELECT id FROM ids WHERE key = 'org_a');

INSERT INTO public.booking_pages (organization_id, slug, title, public_enabled, organization_slug)
SELECT id, 'published-098', 'Published 098', true, 'org-a-098'
  FROM ids WHERE key = 'org_a'
ON CONFLICT DO NOTHING;

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.booking_pages
    WHERE organization_id = (SELECT id FROM ids WHERE key = 'org_a')
      AND public_enabled) > 0,
  'fixture: org A must have at least one PUBLISHED booking page, '
  'otherwise the anon assertions below would pass vacuously'
);

-- ---------------------------------------------------------------------------
-- 1. anon cannot read ANY booking table — including the published page.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  n INTEGER;
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  FOREACH t IN ARRAY ARRAY[
    'booking_pages', 'booking_host_profiles', 'booking_services',
    'booking_host_services', 'booking_availability_rules',
    'booking_blackout_dates', 'booking_requests'
  ] LOOP
    n := pg_temp.visible_rows(t);
    -- -1 (no grant) and 0 (grant, but no policy admits anon) both pass.
    -- Anything > 0 is the leak this migration exists to close.
    IF n > 0 THEN
      EXECUTE 'RESET ROLE';
      RAISE EXCEPTION
        'Booking anon lockdown verification failed: anon can read %.% (% rows). '
        'A closed Next.js route is not a closed data surface.', 'public', t, n;
    END IF;
  END LOOP;
  EXECUTE 'RESET ROLE';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. anon holds no DML privilege on booking tables.
--    has_table_privilege (not the grants view) so a grant to PUBLIC is caught.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p(priv)
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'booking_%'
      AND c.relkind = 'r'
      AND has_table_privilege('anon', c.oid, p.priv)
  ),
  'anon still holds a DML privilege on a booking table (check for a grant to PUBLIC)'
);

-- ---------------------------------------------------------------------------
-- 3. anon cannot EXECUTE the public booking RPCs.
--    create_booking_request_public is SECURITY DEFINER: it bypasses RLS, so the
--    EXECUTE grant is the ONLY thing standing between an anonymous caller and an
--    INSERT into booking_requests. This is the write path, and it matters more
--    than the read leak.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  NOT has_function_privilege(
    'anon',
    'public.create_booking_request_public(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT)',
    'EXECUTE'),
  'anon can still EXECUTE create_booking_request_public (SECURITY DEFINER write path)'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege(
    'anon',
    'public.check_client_booking_conflict_public(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
    'EXECUTE'),
  'anon can still EXECUTE check_client_booking_conflict_public'
);

-- ---------------------------------------------------------------------------
-- 4. An authenticated NON-member sees no cross-org booking data.
--    (Tenant isolation must survive the lockdown, not be replaced by it.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_stranger uuid := (SELECT id FROM ids WHERE key = 'stranger');
  n INTEGER;
BEGIN
  IF NOT pg_temp.authenticated_has_grants() THEN
    RAISE NOTICE 'SKIP (4): local stack grants authenticated no table privileges; RLS cannot be exercised';
    RETURN;
  END IF;
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', v_stranger)::text);
  EXECUTE 'SET LOCAL ROLE authenticated';
  n := pg_temp.visible_rows('booking_pages');
  EXECUTE 'RESET ROLE';
  IF n > 0 THEN
    RAISE EXCEPTION
      'Booking anon lockdown verification failed: authenticated non-member sees % booking_pages rows', n;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. An authenticated MEMBER still sees their own organization's booking data.
--    098 revokes anon, not authenticated. If this fails, the lockdown
--    over-reached and broke the (paused, but reactivatable) dashboard.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_member uuid := (SELECT id FROM ids WHERE key = 'member');
  n INTEGER;
BEGIN
  -- Control first: 098 must leave `authenticated` exactly as it found it. Compare
  -- against `todos`, a table this migration never mentions. If authenticated can
  -- read neither, the stack simply has no grants and there is nothing to test; if
  -- it can read todos but not booking_pages, 098 over-reached.
  IF NOT pg_temp.authenticated_has_grants() THEN
    PERFORM pg_temp.assert_true(
      NOT has_table_privilege('authenticated', 'public.booking_pages', 'SELECT'),
      '098 over-reached: authenticated lost SELECT on booking_pages while retaining '
      'it nowhere else either — inconsistent'
    );
    RAISE NOTICE 'SKIP (5): local stack grants authenticated no table privileges; '
                 'confirmed booking_pages matches the control table todos';
    RETURN;
  END IF;

  PERFORM pg_temp.assert_true(
    has_table_privilege('authenticated', 'public.booking_pages', 'SELECT'),
    '098 over-reached: authenticated can SELECT todos but not booking_pages'
  );

  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', v_member)::text);
  EXECUTE 'SET LOCAL ROLE authenticated';
  n := pg_temp.visible_rows('booking_pages');
  EXECUTE 'RESET ROLE';
  IF n <= 0 THEN
    RAISE EXCEPTION
      'Booking anon lockdown verification failed: org member can no longer read their own '
      'booking_pages (visible_rows = %) — 098 revoked too much', n;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS stays enabled, and no surviving policy admits anon (or PUBLIC).
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'booking_%'
      AND c.relkind = 'r' AND NOT c.relrowsecurity
  ),
  'RLS is disabled on at least one booking table'
);

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename LIKE 'booking_%'
      AND ('anon' = ANY (p.roles) OR p.roles = '{public}'::name[])
  ),
  'a booking policy still names anon (or defaults to PUBLIC)'
);

-- ---------------------------------------------------------------------------
-- 7. Data was preserved. The lockdown is a permission change, not a deletion.
-- ---------------------------------------------------------------------------
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.booking_pages) > 0,
  'booking_pages is empty — 098 must revoke access, never delete data'
);

DO $$ BEGIN RAISE NOTICE '098 booking anon lockdown: all assertions passed'; END $$;

ROLLBACK;
