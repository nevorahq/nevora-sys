-- Standalone Tasks runtime grant boundary.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'tasks service runtime verification failed: %', message;
  END IF;
END;
$$;

SELECT pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.reserve_tasks_usage_for_service(uuid,uuid,numeric)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.release_tasks_usage_for_service(uuid,uuid,numeric)',
    'EXECUTE'
  ),
  'service_role must execute Tasks usage functions'
);

SELECT pg_temp.assert_true(
  NOT has_function_privilege(
    'anon',
    'public.reserve_tasks_usage_for_service(uuid,uuid,numeric)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.reserve_tasks_usage_for_service(uuid,uuid,numeric)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.release_tasks_usage_for_service(uuid,uuid,numeric)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.release_tasks_usage_for_service(uuid,uuid,numeric)',
    'EXECUTE'
  ),
  'browser roles must not execute Tasks service usage functions'
);

SELECT pg_temp.assert_true(
  (
    SELECT bool_and(p.prosecdef)
    FROM pg_proc p
    WHERE p.oid IN (
      'public.reserve_tasks_usage_for_service(uuid,uuid,numeric)'::regprocedure,
      'public.release_tasks_usage_for_service(uuid,uuid,numeric)'::regprocedure
    )
  ),
  'Tasks usage functions must be SECURITY DEFINER'
);

ROLLBACK;
