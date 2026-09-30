-- Email digest switch verification (migration 127, ADR 003 step 2).
-- Run after the migrations; all fixtures are rolled back.
--
-- Proves: the switch exists, defaults to on, cannot be NULL, and an email
-- digest row is accepted by the 126 log alongside a Telegram one for the same day.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'Email digest verification failed: %', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.raises(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'email-digest@example.test', 'x', now(), now(), now());
INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'Email Digest Org', 'email-digest-org', 'free');
INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'member', 'active');

INSERT INTO public.user_notification_preferences (organization_id, user_id)
VALUES ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT email_digest_enabled FROM public.user_notification_preferences WHERE user_id = 'e1000000-0000-4000-8000-000000000001'),
  'the email digest defaults to on'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.user_notification_preferences SET email_digest_enabled = NULL
    WHERE user_id = 'e1000000-0000-4000-8000-000000000001'$$),
  'the switch cannot be NULL'
);

INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status, sent_at, item_count) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'telegram', '2026-09-30', 'sent', now(), 2),
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'email', '2026-09-30', 'skipped', NULL, 0);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.notification_digests WHERE user_id = 'e1000000-0000-4000-8000-000000000001') = 2,
  'one row per channel for the same day'
);

ROLLBACK;
