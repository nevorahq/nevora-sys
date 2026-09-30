-- Daily notification digest verification (migration 126, ADR 003 step 1).
-- Run after the migrations; all fixtures are rolled back.
--
-- Proves: preferences default to "digest on at 09:00" and reject an impossible
-- hour; one digest per user, organization, channel and day; only known channels
-- and statuses; `sent` carries `sent_at` and nothing else does; a user reads
-- only their own digests and can write none of them.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION 'Notification digest verification failed: %', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_user uuid) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub', p_user::text, true); END $$;

CREATE OR REPLACE FUNCTION pg_temp.raises(p_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$ BEGIN EXECUTE p_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN true; END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'digest-a@example.test', 'x', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'digest-b@example.test', 'x', now(), now(), now());

INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('d2000000-0000-4000-8000-000000000001', 'Digest Org', 'digest-org', 'free');

INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'member', 'active'),
  ('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'member', 'active');

-- Preferences: digest on at 09:00 by default; the hour stays within a day.
INSERT INTO public.user_notification_preferences (organization_id, user_id)
VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT telegram_digest_enabled AND digest_hour = 9 FROM public.user_notification_preferences
    WHERE user_id = 'd1000000-0000-4000-8000-000000000001'),
  'the digest defaults to on at 09:00'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.user_notification_preferences SET digest_hour = 24
    WHERE user_id = 'd1000000-0000-4000-8000-000000000001'$$),
  'digest_hour must be 0–23'
);

-- One digest per user, organization, channel and local day.
INSERT INTO public.notification_digests (id, organization_id, user_id, channel, local_date, status, item_count, sent_at)
VALUES ('d5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
        'telegram', '2026-09-30', 'sent', 3, now());
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status, reason)
    VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'telegram', '2026-09-30', 'skipped', 'empty')$$),
  'a second digest for the same user, channel and day must be rejected'
);
INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status, reason)
VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'email', '2026-09-30', 'skipped', 'no_address');
INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status, reason)
VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'telegram', '2026-10-01', 'skipped', 'empty');

-- Only known channels and statuses; sent ⇔ sent_at.
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status)
    VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'sms', '2026-09-30', 'skipped')$$),
  'only known channels are stored'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status)
    VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'telegram', '2026-09-30', 'sent')$$),
  'a sent digest must carry sent_at'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status, sent_at)
    VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', 'telegram', '2026-09-30', 'failed', now())$$),
  'only a sent digest carries sent_at'
);

-- A user reads their own digests only, and writes none.
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d1000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.notification_digests) = 3,
  'a user sees their own digests'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$INSERT INTO public.notification_digests (organization_id, user_id, channel, local_date, status, reason)
    VALUES ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'telegram', '2026-10-02', 'skipped', 'empty')$$),
  'a user must not write digests'
);
SELECT pg_temp.assert_true(
  pg_temp.raises($$UPDATE public.notification_digests SET status = 'failed', sent_at = NULL
    WHERE id = 'd5000000-0000-4000-8000-000000000001'$$),
  'a user must not change a digest'
);

SELECT pg_temp.act_as('d1000000-0000-4000-8000-000000000002');
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.notification_digests),
  'a user must not see another member''s digests'
);

RESET ROLE;
ROLLBACK;
