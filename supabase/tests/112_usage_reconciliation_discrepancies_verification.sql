-- Usage-reconciliation discrepancy table verification (migration 112).

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Usage-discrepancy verification failed: %', message;
  END IF;
END;
$$;

-- Table + indexes exist.
SELECT pg_temp.assert_true(
  to_regclass('public.usage_reconciliation_discrepancies') IS NOT NULL,
  'discrepancy table is missing'
);
SELECT pg_temp.assert_true(
  to_regclass('public.usage_reconciliation_discrepancies_detected_idx') IS NOT NULL,
  'detected_at index is missing'
);
SELECT pg_temp.assert_true(
  to_regclass('public.usage_reconciliation_discrepancies_org_detected_idx') IS NOT NULL,
  'org/detected_at index is missing'
);

-- RLS is enabled (fail-closed: no policy → deny anon/authenticated).
SELECT pg_temp.assert_true(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.usage_reconciliation_discrepancies'::regclass),
  'row level security is not enabled'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usage_reconciliation_discrepancies'),
  'expected no RLS policy (service-role only)'
);

-- anon / authenticated hold no table privileges.
SELECT pg_temp.assert_true(
  NOT has_table_privilege('anon', 'public.usage_reconciliation_discrepancies', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.usage_reconciliation_discrepancies', 'SELECT'),
  'anon must have no access'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'public.usage_reconciliation_discrepancies', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.usage_reconciliation_discrepancies', 'SELECT'),
  'authenticated must have no access'
);

ROLLBACK;
