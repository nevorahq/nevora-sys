-- Run after migrations 073 and 074. Disposable fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION '%', message; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_notification_update_rejected(notification_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  UPDATE public.notifications SET title = 'tampered' WHERE id = notification_id;
  RAISE EXCEPTION 'expected notification update rejection';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN RETURN;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_notification_insert_rejected(
  notification_id uuid,
  org_id uuid,
  user_id uuid,
  action_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  INSERT INTO public.notifications (id, organization_id, user_id, type, title, category, priority, action_item_id)
  VALUES (notification_id, org_id, user_id, 'task', 'cross-org link', 'task', 'high', action_id);
  RAISE EXCEPTION 'expected notification insert rejection';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN RETURN;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_mark_all_rejected(org_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  PERFORM public.mark_all_visible_notifications_read(org_id);
  RAISE EXCEPTION 'expected mark-all rejection';
EXCEPTION WHEN insufficient_privilege THEN RETURN;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_notification_update_rejected(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_notification_insert_rejected(uuid, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.expect_mark_all_rejected(uuid) TO authenticated;

SELECT pg_temp.assert_true(
  (SELECT bool_and(COALESCE(p.proconfig, '{}') @> ARRAY['search_path=public, pg_catalog'])
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('get_unread_notification_count', 'mark_all_visible_notifications_read', 'mark_notification_read', 'mark_terminal_action_notifications_read')),
  'notification functions pin a safe search_path'
);
SELECT pg_temp.assert_true(
  (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.mark_notification_read(uuid,uuid)'::regprocedure)
  AND (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.mark_all_visible_notifications_read(uuid)'::regprocedure)
  AND (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.get_unread_notification_count(uuid)'::regprocedure),
  'notification RPCs validate once at a SECURITY DEFINER boundary'
);
SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.mark_notification_read(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.mark_all_visible_notifications_read(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.mark_notification_read(uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.mark_all_visible_notifications_read(uuid)', 'EXECUTE'),
  'write RPC grants are authenticated-only'
);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) VALUES
  ('12000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'tab-a@example.test', 'x', now(), now(), now()),
  ('12000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'tab-b@example.test', 'x', now(), now(), now());
INSERT INTO public.organizations (id, name, slug, plan) VALUES
  ('22000000-0000-4000-8000-00000000000a', 'Tab Org A', 'tab-org-a', 'free'),
  ('22000000-0000-4000-8000-00000000000b', 'Tab Org B', 'tab-org-b', 'free');
INSERT INTO public.memberships (user_id, organization_id, role, status) VALUES
  ('12000000-0000-4000-8000-00000000000a', '22000000-0000-4000-8000-00000000000a', 'owner', 'active'),
  ('12000000-0000-4000-8000-00000000000a', '22000000-0000-4000-8000-00000000000b', 'owner', 'active'),
  ('12000000-0000-4000-8000-00000000000b', '22000000-0000-4000-8000-00000000000a', 'member', 'active');

INSERT INTO public.action_items (id, organization_id, title, type, status, priority, source_type, source_id, created_by) VALUES
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-00000000000a', 'Active task', 'overdue', 'open', 'high', 'task', '42000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-00000000000a'),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-00000000000a', 'Resolved task', 'overdue', 'resolved', 'high', 'task', '42000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-00000000000a'),
  ('32000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-00000000000a', 'Task to resolve', 'overdue', 'open', 'high', 'task', '42000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-00000000000a');

INSERT INTO public.notifications (id, organization_id, user_id, type, title, category, priority, action_item_id, read_at, deduplication_key) VALUES
  ('52000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000a', 'task', 'Unread active', 'task', 'high', '32000000-0000-4000-8000-000000000001', NULL, 'tab-1'),
  ('52000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000a', 'task', 'Already read', 'task', 'high', '32000000-0000-4000-8000-000000000001', now(), 'tab-2'),
  ('52000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000a', 'task', 'Resolved source', 'task', 'high', '32000000-0000-4000-8000-000000000002', NULL, 'tab-3'),
  ('52000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000a', 'action_center', 'Normal action', 'action_center', 'normal', NULL, NULL, 'tab-4'),
  ('52000000-0000-4000-8000-000000000005', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000b', 'task', 'Other user', 'task', 'high', NULL, NULL, 'tab-5'),
  ('52000000-0000-4000-8000-000000000006', '22000000-0000-4000-8000-00000000000b', '12000000-0000-4000-8000-00000000000a', 'task', 'Other org', 'task', 'high', NULL, NULL, 'tab-6'),
  ('52000000-0000-4000-8000-000000000007', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000a', 'task', 'Resolve me', 'task', 'high', '32000000-0000-4000-8000-000000000003', NULL, 'tab-7'),
  ('52000000-0000-4000-8000-000000000008', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000a', 'task', 'Mark all', 'task', 'high', NULL, NULL, 'tab-8'),
  ('52000000-0000-4000-8000-000000000009', '22000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-00000000000a', 'task', 'Already terminal link', 'task', 'high', '32000000-0000-4000-8000-000000000002', NULL, 'tab-9'),
  ('52000000-0000-4000-8000-000000000010', '22000000-0000-4000-8000-00000000000b', '12000000-0000-4000-8000-00000000000a', 'task', 'Mismatched action org', 'task', 'high', '32000000-0000-4000-8000-000000000001', NULL, 'tab-10');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-00000000000a', true);

SELECT pg_temp.assert_true(public.get_unread_notification_count('22000000-0000-4000-8000-00000000000a') = 6, 'count includes every unread delivery for user A in org A');
SELECT pg_temp.assert_true(public.get_unread_notification_count('22000000-0000-4000-8000-00000000000b') = 2, 'count is scoped to selected organization and includes every owned delivery');
SELECT pg_temp.assert_true(public.mark_notification_read('22000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000001') = 5, 'mark-one returns the authoritative remaining count');
SELECT pg_temp.assert_true(public.mark_notification_read('22000000-0000-4000-8000-00000000000a', '52000000-0000-4000-8000-000000000001') = 5, 'mark-one is idempotent');

SELECT pg_temp.expect_notification_update_rejected('52000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_notification_update_rejected('52000000-0000-4000-8000-000000000005');
SELECT pg_temp.expect_notification_insert_rejected(
  '52000000-0000-4000-8000-000000000011',
  '22000000-0000-4000-8000-00000000000b',
  '12000000-0000-4000-8000-00000000000a',
  '32000000-0000-4000-8000-000000000001'
);

UPDATE public.action_items SET status = 'resolved', resolved_at = now()
WHERE id = '32000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_true((SELECT read_at IS NOT NULL FROM public.notifications WHERE id = '52000000-0000-4000-8000-000000000007'), 'terminal action trigger marks its notification read');
SELECT pg_temp.assert_true(public.get_unread_notification_count('22000000-0000-4000-8000-00000000000a') = 4, 'resolved source acknowledges only its linked delivery');

UPDATE public.action_items SET status = status
WHERE id = '32000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT read_at IS NULL FROM public.notifications WHERE id = '52000000-0000-4000-8000-000000000009'), 'no-op status updates to an already-terminal action do not mark notifications read');

SELECT pg_temp.assert_true(public.mark_all_visible_notifications_read('22000000-0000-4000-8000-00000000000a') = 0, 'mark all clears visible org A count');
SELECT pg_temp.assert_true(public.mark_all_visible_notifications_read('22000000-0000-4000-8000-00000000000a') = 0, 'mark all is idempotent');

RESET ROLE;
SELECT pg_temp.assert_true((SELECT read_at IS NULL FROM public.notifications WHERE id = '52000000-0000-4000-8000-000000000005'), 'mark all did not update another user');
SELECT pg_temp.assert_true((SELECT read_at IS NULL FROM public.notifications WHERE id = '52000000-0000-4000-8000-000000000006'), 'mark all did not update another organization');
SELECT pg_temp.assert_true((SELECT read_at IS NOT NULL FROM public.notifications WHERE id = '52000000-0000-4000-8000-000000000003'), 'mark all acknowledges delivered history even when its action is resolved');
SELECT pg_temp.assert_true((SELECT read_at IS NULL FROM public.notifications WHERE id = '52000000-0000-4000-8000-000000000010'), 'mark all did not update a notification linked across organizations');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated', 'public.notifications', 'UPDATE'), 'authenticated cannot update notification delivery fields directly');

UPDATE public.memberships SET status = 'suspended'
WHERE user_id = '12000000-0000-4000-8000-00000000000a' AND organization_id = '22000000-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-00000000000a', true);
SELECT pg_temp.assert_true(public.get_unread_notification_count('22000000-0000-4000-8000-00000000000a') = 0, 'membership loss removes notification access');
SELECT pg_temp.expect_mark_all_rejected('22000000-0000-4000-8000-00000000000a');

RESET ROLE;
ROLLBACK;
