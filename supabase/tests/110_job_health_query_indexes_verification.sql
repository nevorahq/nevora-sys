-- Job-health query-index verification (migration 110).

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Job-health index verification failed: %', message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  to_regclass('public.reminder_schedules_processing_last_attempt_idx') IS NOT NULL,
  'processing reminder index is missing'
);
SELECT pg_temp.assert_true(
  to_regclass('public.reminder_schedules_failed_last_attempt_idx') IS NOT NULL,
  'failed reminder index is missing'
);
SELECT pg_temp.assert_true(
  to_regclass('public.document_extractions_processing_started_idx') IS NOT NULL,
  'processing extraction index is missing'
);
SELECT pg_temp.assert_true(
  to_regclass('public.automation_audit_logs_failed_created_idx') IS NOT NULL,
  'failed automation index is missing'
);

ROLLBACK;
