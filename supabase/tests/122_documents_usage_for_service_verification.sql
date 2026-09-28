-- documents.count reservation for a service actor (migration 122, ADR 002).
-- Run after the migrations; all fixtures are rolled back.
--
-- Proves: only service_role may call the pair; the functions themselves refuse
-- a non-member actor; a member reserves and releases the documents.count slot.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'Documents service usage verification failed: %', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.raises(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

SELECT pg_temp.assert_true(
  NOT has_function_privilege('authenticated', 'public.reserve_documents_usage_for_service(uuid,uuid,numeric)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.reserve_documents_usage_for_service(uuid,uuid,numeric)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.release_documents_usage_for_service(uuid,uuid,numeric)', 'EXECUTE'),
  'browser roles must not call the service usage functions'
);
SELECT pg_temp.assert_true(
  has_function_privilege('service_role', 'public.reserve_documents_usage_for_service(uuid,uuid,numeric)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.release_documents_usage_for_service(uuid,uuid,numeric)', 'EXECUTE'),
  'service_role must be able to call the service usage functions'
);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'svc-member@example.test', 'x', now(), now(), now()),
  ('f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'svc-stranger@example.test', 'x', now(), now(), now());
INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'Svc Org', 'svc-org', 'free');
INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', 'member', 'active');

SELECT pg_temp.assert_true(
  pg_temp.raises($$SELECT public.reserve_documents_usage_for_service(
    'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 1)$$),
  'a non-member actor must not reserve for the organization'
);

SELECT pg_temp.assert_true(
  public.reserve_documents_usage_for_service('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 1) = 1,
  'a member reserves one documents.count slot'
);
SELECT pg_temp.assert_true(
  public.release_documents_usage_for_service('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 1) = 0,
  'the slot is released again'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$SELECT public.reserve_documents_usage_for_service(
    'f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 0)$$),
  'a non-positive increment is refused'
);

ROLLBACK;
