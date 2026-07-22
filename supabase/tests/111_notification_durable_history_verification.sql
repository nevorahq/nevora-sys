-- Durable notification-history verification (migration 111).

\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Durable notification-history verification failed: %', message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  position(
    'category_disabled' IN pg_get_functiondef('public.process_due_reminders(integer)'::regprocedure)
  ) = 0,
  'process_due_reminders must not suppress durable history for a muted category'
);

ROLLBACK;
