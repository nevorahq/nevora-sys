-- Run after `supabase db reset`; all fixtures are rolled back.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION '%', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_preference_insert_rejected(org_id uuid, user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  INSERT INTO public.user_notification_preferences (organization_id, user_id) VALUES (org_id, user_id);
  RAISE EXCEPTION 'expected preference insert rejection';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN RETURN;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_push_insert_rejected(org_id uuid, user_id uuid, endpoint text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  INSERT INTO public.push_subscriptions (organization_id, user_id, endpoint, p256dh, auth_key)
  VALUES (org_id, user_id, endpoint, repeat('p', 30), repeat('a', 12));
  RAISE EXCEPTION 'expected push insert rejection';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN RETURN;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_duplicate_delivery_rejected(org_id uuid, user_id uuid, notification_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  INSERT INTO public.notification_deliveries (organization_id, user_id, notification_id, channel, idempotency_key, status)
  VALUES (org_id, user_id, notification_id, 'in_app', 'same-key', 'sent');
  RAISE EXCEPTION 'expected duplicate delivery rejection';
EXCEPTION WHEN unique_violation THEN RETURN;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_preference_insert_rejected(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_push_insert_rejected(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_duplicate_delivery_rejected(uuid, uuid, uuid) TO authenticated;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('11000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'notify-a@example.test', 'x', now(), now(), now()),
  ('11000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'notify-b@example.test', 'x', now(), now(), now());
INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('21000000-0000-4000-8000-00000000000a', 'Notify A', 'notify-a', 'free'),
  ('21000000-0000-4000-8000-00000000000b', 'Notify B', 'notify-b', 'free');
INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('11000000-0000-4000-8000-00000000000a', '21000000-0000-4000-8000-00000000000a', 'owner', 'active'),
  ('11000000-0000-4000-8000-00000000000b', '21000000-0000-4000-8000-00000000000b', 'owner', 'active');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-00000000000a', true);

INSERT INTO public.user_notification_preferences (organization_id, user_id)
VALUES ('21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-00000000000a');
SELECT pg_temp.assert_true((SELECT count(*) FROM public.user_notification_preferences) = 1, 'user sees only own preference');
SELECT pg_temp.expect_preference_insert_rejected('21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-00000000000b');
SELECT pg_temp.expect_preference_insert_rejected('21000000-0000-4000-8000-00000000000b', '11000000-0000-4000-8000-00000000000a');
SELECT pg_temp.expect_push_insert_rejected('21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-00000000000b', 'https://push.example/other-user');
SELECT pg_temp.expect_push_insert_rejected('21000000-0000-4000-8000-00000000000b', '11000000-0000-4000-8000-00000000000a', 'https://push.example/other-org');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT'), 'push key material is not client-readable');

INSERT INTO public.notifications (id, organization_id, user_id, type, title, deduplication_key)
VALUES ('31000000-0000-4000-8000-00000000000a', '21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-00000000000a', 'action_center', 'Test', 'test-one');
INSERT INTO public.notification_deliveries (organization_id, user_id, notification_id, channel, idempotency_key, status)
VALUES ('21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a', 'in_app', 'same-key', 'sent');
SELECT pg_temp.expect_duplicate_delivery_rejected('21000000-0000-4000-8000-00000000000a', '11000000-0000-4000-8000-00000000000a', '31000000-0000-4000-8000-00000000000a');

RESET ROLE;
ROLLBACK;
