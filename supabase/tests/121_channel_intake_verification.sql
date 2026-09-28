-- Channel intake verification (migration 121, ADR 002 step 1).
-- Run after the migrations; all fixtures are rolled back.
--
-- Proves: a user sees and revokes only their OWN channel integration and can
-- never create or re-activate one (the webhook does that with the service
-- role); link codes are issued only for yourself; and a channel message key
-- is unique per organization + channel, so a redelivery is one capture.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'Channel intake verification failed: %', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', p_user::text, true); END $$;

-- Runs a statement as the current role; true when it raised.
CREATE OR REPLACE FUNCTION pg_temp.raises(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ch-member1@example.test', 'x', now(), now(), now()),
  ('e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ch-member2@example.test', 'x', now(), now(), now());

INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'Channel Org', 'channel-org', 'free');

INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'member', 'active'),
  ('e1000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'member', 'active');

-- As the webhook would (superuser here, service role in production).
INSERT INTO public.channel_integrations (id, organization_id, user_id, channel, external_user_id, external_chat_id, status) VALUES
  ('e3000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'telegram', '111', '111', 'active'),
  ('e3000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'telegram', '222', '222', 'active');

-- One Telegram account → one active Nevora user.
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.channel_integrations (organization_id, user_id, channel, external_user_id, status)
    VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'telegram', '111', 'active')$$),
  'an external account must not be actively linked twice'
);

-- A redelivered message is one capture per org + channel.
INSERT INTO public.planner_entries (organization_id, created_by, owner_user_id, raw_text, entry_type, source, status, channel, channel_message_key)
VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'buy toner', 'text', 'channel', 'captured', 'telegram', '111:5');
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.planner_entries (organization_id, created_by, owner_user_id, raw_text, entry_type, source, status, channel, channel_message_key)
    VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'buy toner', 'text', 'channel', 'captured', 'telegram', '111:5')$$),
  'the same channel message must not be captured twice'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.planner_entries (organization_id, created_by, owner_user_id, raw_text, entry_type, source, status, channel)
    VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'x', 'text', 'channel', 'captured', 'telegram')$$),
  'a channel capture must carry its message key'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('e1000000-0000-4000-8000-000000000001');

SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.channel_integrations WHERE id = 'e3000000-0000-4000-8000-000000000001'),
  'a user sees their own integration'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.channel_integrations WHERE id = 'e3000000-0000-4000-8000-000000000002'),
  'a user must not see another member''s integration'
);

-- Only the webhook links accounts.
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.channel_integrations (organization_id, user_id, channel, external_user_id, status)
    VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'telegram', '999', 'active')$$),
  'a user must not create an integration directly'
);

-- Another member's integration cannot be revoked (RLS filters it out: 0 rows).
UPDATE public.channel_integrations SET status = 'revoked', revoked_at = now()
  WHERE id = 'e3000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.channel_integrations SET external_user_id = '999'
    WHERE id = 'e3000000-0000-4000-8000-000000000001'$$),
  'a user must not rewrite which account is linked'
);

-- Own integration: revoke works, re-activation does not.
UPDATE public.channel_integrations SET status = 'revoked', revoked_at = now()
  WHERE id = 'e3000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT status FROM public.channel_integrations WHERE id = 'e3000000-0000-4000-8000-000000000001') = 'revoked',
  'a user can revoke their own integration'
);
UPDATE public.channel_integrations SET status = 'active', revoked_at = NULL
  WHERE id = 'e3000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT status FROM public.channel_integrations WHERE id = 'e3000000-0000-4000-8000-000000000001') = 'revoked',
  'a user must not re-activate a revoked integration'
);

-- Link codes: for yourself only, short-lived, never pre-consumed.
INSERT INTO public.channel_link_codes (organization_id, user_id, channel, code_hash, expires_at)
VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'telegram', repeat('a', 64), now() + interval '15 minutes');
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.channel_link_codes (organization_id, user_id, channel, code_hash, expires_at)
    VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'telegram', repeat('b', 64), now() + interval '15 minutes')$$),
  'a user must not issue a link code for another member'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.channel_link_codes (organization_id, user_id, channel, code_hash, expires_at)
    VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'telegram', repeat('c', 64), now() + interval '30 days')$$),
  'a link code must be short-lived'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.channel_link_codes SET used_at = now() WHERE user_id = 'e1000000-0000-4000-8000-000000000001'$$),
  'only the webhook consumes a link code'
);

RESET ROLE;
ROLLBACK;
