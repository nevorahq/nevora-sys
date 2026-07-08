-- ============================================================
-- 098 — Booking anon lockdown
-- ============================================================
--
-- Booking was paused as a product: `/booking/*` and `/api/public/booking/*`
-- return 404 (`assertPausedModuleEnabled` / `pausedModuleGuard`).
--
-- That closed the *Next.js* surface. It did not close the *data* surface.
-- Supabase REST sits beside the app, not behind it, so with the public
-- `NEXT_PUBLIC_SUPABASE_ANON_KEY` anyone could still:
--
--   1. READ published booking data directly, via the `*_select_anon` policies
--      created in 016. Verified against production 2026-07-08:
--        booking_pages          -> 3 rows across 3 organizations
--        booking_host_profiles  -> 2 rows (display_name, avatar_url,
--                                  user_id, membership_id)
--        booking_services       -> 3 rows
--        booking_host_services  -> rows
--      018 even denormalized `organization_slug` onto booking_pages
--      specifically so anon could query without a JOIN on organizations.
--
--   2. WRITE, via `create_booking_request_public` — a SECURITY DEFINER function
--      that bypasses RLS entirely and was granted EXECUTE to `anon` (016, 018,
--      re-granted in 035). Confirmed live: an anon call to the sibling read-only
--      RPC `check_client_booking_conflict_public` returned `{"conflict": false}`
--      rather than a permission error.
--
-- The write path is the worse of the two: an anonymous caller could insert
-- booking_requests into any organization with a published page.
--
-- This migration closes both. It does NOT reactivate Booking, does NOT drop the
-- functions, and does NOT touch any row of data. `authenticated` access is left
-- exactly as it was, so the dashboard-side (also paused, separately gated) and
-- any future reactivation keep working. Reactivating Booking's public surface
-- later means re-granting deliberately — which is the point.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop the anon SELECT policies created in 016.
-- ------------------------------------------------------------
-- Naming is stable (`<table>_select_anon`); the `_select_auth` siblings stay.
DROP POLICY IF EXISTS "booking_pages_select_anon"              ON public.booking_pages;
DROP POLICY IF EXISTS "booking_host_profiles_select_anon"      ON public.booking_host_profiles;
DROP POLICY IF EXISTS "booking_services_select_anon"           ON public.booking_services;
DROP POLICY IF EXISTS "booking_host_services_select_anon"      ON public.booking_host_services;
DROP POLICY IF EXISTS "booking_availability_rules_select_anon" ON public.booking_availability_rules;
DROP POLICY IF EXISTS "booking_blackout_dates_select_anon"     ON public.booking_blackout_dates;

-- ------------------------------------------------------------
-- 2. Revoke table privileges from anon (defence in depth).
-- ------------------------------------------------------------
-- Dropping the policies is what actually denies the read, because RLS is on and
-- deny-by-default. But Supabase grants table privileges to `anon` wholesale, so
-- a future `CREATE POLICY ... TO anon` — or a policy accidentally written
-- without a role list, which defaults to PUBLIC — would silently re-open the
-- table. Revoking the grant means such a mistake fails loudly instead.
REVOKE ALL ON TABLE public.booking_pages              FROM anon;
REVOKE ALL ON TABLE public.booking_host_profiles      FROM anon;
REVOKE ALL ON TABLE public.booking_services           FROM anon;
REVOKE ALL ON TABLE public.booking_host_services      FROM anon;
REVOKE ALL ON TABLE public.booking_availability_rules FROM anon;
REVOKE ALL ON TABLE public.booking_blackout_dates     FROM anon;
REVOKE ALL ON TABLE public.booking_requests           FROM anon;

-- ------------------------------------------------------------
-- 3. Revoke EXECUTE on the public booking RPCs from anon.
-- ------------------------------------------------------------
-- Both are SECURITY DEFINER and therefore ignore RLS: revoking the grant is the
-- only thing that stops an anonymous caller. Signatures must match exactly
-- (they are the ones pinned in 035_rpc_grant_hardening.sql).
--
-- `authenticated` keeps EXECUTE. The functions themselves are left in place;
-- the route handlers that call them already 404 while Booking is paused.
REVOKE EXECUTE ON FUNCTION public.create_booking_request_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.check_client_booking_conflict_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM anon;

-- ------------------------------------------------------------
-- 4. RLS must stay enabled on every booking table.
-- ------------------------------------------------------------
-- Enabling is idempotent. Asserting afterwards turns a silent misconfiguration
-- into a failed migration.
ALTER TABLE public.booking_pages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_host_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_host_services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_blackout_dates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests           ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_unprotected TEXT;
  v_anon_policy TEXT;
  v_anon_grant  TEXT;
BEGIN
  -- 4a. RLS enabled everywhere.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname LIKE 'booking_%'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;

  IF v_unprotected IS NOT NULL THEN
    RAISE EXCEPTION '098: RLS is disabled on booking tables: %', v_unprotected;
  END IF;

  -- 4b. No policy may still admit anon. `roles` holds `0` (= PUBLIC) when the
  --     policy has no explicit role list, and PUBLIC includes anon.
  SELECT string_agg(format('%s.%s', p.tablename, p.policyname), ', ' ORDER BY p.policyname)
    INTO v_anon_policy
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename LIKE 'booking_%'
    AND (
      'anon' = ANY (p.roles)
      OR p.roles = '{public}'::name[]
    );

  IF v_anon_policy IS NOT NULL THEN
    RAISE EXCEPTION '098: booking policies still reachable by anon: %', v_anon_policy;
  END IF;

  -- 4c. anon must hold no DML privilege on any booking table.
  --
  -- Deliberately `has_table_privilege` rather than a scan of
  -- information_schema.role_table_grants filtered on `grantee = 'anon'`.
  -- A privilege granted to PUBLIC — which anon is a member of — never appears
  -- under that grantee, so the grants view would report "clean" while anon could
  -- still read every row. has_table_privilege answers the question we actually
  -- care about ("can anon do this?") and resolves role inheritance for us.
  --
  -- REFERENCES/TRIGGER/TRUNCATE are ignored: they are not a data-read surface.
  SELECT string_agg(format('%s(%s)', t.tbl, t.priv), ', ' ORDER BY t.tbl, t.priv)
    INTO v_anon_grant
  FROM (
    SELECT c.relname AS tbl, p.priv
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS p(priv)
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'booking_%'
      AND c.relkind = 'r'
      AND has_table_privilege('anon', c.oid, p.priv)
  ) t;

  IF v_anon_grant IS NOT NULL THEN
    RAISE EXCEPTION
      '098: anon still holds DML privileges on booking tables: % '
      '(look for a grant to PUBLIC, not just to anon)', v_anon_grant;
  END IF;

  -- 4d. No residual EXECUTE grant to anon on the public booking RPCs.
  IF has_function_privilege(
       'anon',
       'public.create_booking_request_public(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT)',
       'EXECUTE')
  THEN
    RAISE EXCEPTION '098: anon can still EXECUTE create_booking_request_public';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.check_client_booking_conflict_public(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
       'EXECUTE')
  THEN
    RAISE EXCEPTION '098: anon can still EXECUTE check_client_booking_conflict_public';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 5. Record the invariant next to the tables it protects.
-- ------------------------------------------------------------
COMMENT ON TABLE public.booking_pages IS
  'Booking is paused. No anon access: the 016 anon SELECT policy and the anon '
  'table grant were removed in 098. A closed Next.js route is not a closed data '
  'surface — Supabase REST is reachable independently of the app. Reactivating '
  'the public booking surface requires deliberately re-granting anon.';

COMMENT ON FUNCTION public.create_booking_request_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  'SECURITY DEFINER public RPC for booking request creation — bypasses RLS. '
  'EXECUTE was revoked from anon in 098 while Booking is paused; authenticated '
  'retains it. Re-grant to anon only when the public booking surface is '
  'deliberately reactivated.';
