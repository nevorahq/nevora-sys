-- channel_integrations.metadata verification (migration 123, ADR 002 step 4).
-- Run after the migrations; all fixtures are rolled back.
--
-- Proves: metadata defaults to an empty object and stays an object; a user can
-- read their own row's metadata but never write it (only the webhook does, as
-- the service role) — column-level UPDATE stays on (status, revoked_at).
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'Channel metadata verification failed: %', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.raises(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'meta-user@example.test', 'x', now(), now(), now());
INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('e6000000-0000-4000-8000-000000000001', 'Meta Org', 'meta-org', 'free');
INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('e5000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'member', 'active');
INSERT INTO public.channel_integrations (id, organization_id, user_id, channel, external_user_id, status) VALUES
  ('e7000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'email', 'abcdefghjkmn', 'active');

SELECT pg_temp.assert_true(
  (SELECT metadata FROM public.channel_integrations WHERE id = 'e7000000-0000-4000-8000-000000000001') = '{}'::jsonb,
  'metadata defaults to an empty object'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.channel_integrations SET metadata = '[]'::jsonb WHERE id = 'e7000000-0000-4000-8000-000000000001'$$),
  'metadata must stay a JSON object'
);

-- The webhook (service role / superuser here) stores a Gmail confirmation.
UPDATE public.channel_integrations
  SET metadata = '{"forwarding_confirmation": {"code": "123456789"}}'::jsonb
  WHERE id = 'e7000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e5000000-0000-4000-8000-000000000001', true);

SELECT pg_temp.assert_true(
  (SELECT metadata -> 'forwarding_confirmation' ->> 'code' FROM public.channel_integrations
    WHERE id = 'e7000000-0000-4000-8000-000000000001') = '123456789',
  'the owner reads their confirmation code'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.channel_integrations SET metadata = '{}'::jsonb
    WHERE id = 'e7000000-0000-4000-8000-000000000001'$$),
  'a user must not write metadata'
);

RESET ROLE;
ROLLBACK;
