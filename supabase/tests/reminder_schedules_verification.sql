-- Run after migration 075. Fixtures are disposable and roll back.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION '%', message; END IF; END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('13000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'reminder-a@example.test', 'x', now(), now(), now()),
  ('13000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'reminder-b@example.test', 'x', now(), now(), now());
INSERT INTO public.organizations (id, name, slug, plan, timezone)
VALUES
  ('23000000-0000-4000-8000-00000000000a', 'Reminder A', 'reminder-a', 'free', 'Europe/Chisinau'),
  ('23000000-0000-4000-8000-00000000000b', 'Reminder B', 'reminder-b', 'free', 'UTC');
INSERT INTO public.memberships (user_id, organization_id, role, status)
VALUES
  ('13000000-0000-4000-8000-00000000000a', '23000000-0000-4000-8000-00000000000a', 'owner', 'active'),
  ('13000000-0000-4000-8000-00000000000b', '23000000-0000-4000-8000-00000000000b', 'owner', 'active');
INSERT INTO public.workspaces (id, organization_id, name, type, is_default)
VALUES
  ('33000000-0000-4000-8000-00000000000a', '23000000-0000-4000-8000-00000000000a', 'Default', 'default', true),
  ('33000000-0000-4000-8000-00000000000b', '23000000-0000-4000-8000-00000000000b', 'Default', 'default', true);

INSERT INTO public.todos (id, organization_id, workspace_id, created_by, updated_by, title, priority, status, due_date)
VALUES ('43000000-0000-4000-8000-00000000000a', '23000000-0000-4000-8000-00000000000a', '33000000-0000-4000-8000-00000000000a',
  '13000000-0000-4000-8000-00000000000a', '13000000-0000-4000-8000-00000000000a', 'Due task', 'medium', 'todo', current_date + 5);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.reminder_schedules WHERE source_type = 'task' AND source_id = '43000000-0000-4000-8000-00000000000a' AND status = 'pending') = 4,
  'normal task has four durable pending milestones'
);

UPDATE public.todos SET due_date = current_date + 10 WHERE id = '43000000-0000-4000-8000-00000000000a';
SELECT pg_temp.assert_true(
  (SELECT count(DISTINCT source_due_at) FROM public.reminder_schedules WHERE source_type = 'task' AND source_id = '43000000-0000-4000-8000-00000000000a' AND status = 'pending') = 1
  AND (SELECT count(*) FROM public.reminder_schedules WHERE source_type = 'task' AND source_id = '43000000-0000-4000-8000-00000000000a' AND status = 'cancelled') = 4,
  'due-date change cancels stale rows and schedules one new source date'
);

UPDATE public.todos SET status = 'done' WHERE id = '43000000-0000-4000-8000-00000000000a';
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.reminder_schedules WHERE source_type = 'task' AND source_id = '43000000-0000-4000-8000-00000000000a' AND status IN ('pending', 'processing')),
  'task completion cancels remaining reminders'
);

-- New organization-owned writes may omit legacy user_id. The trigger derives
-- the recipient from created_by and creates the due-today delivery milestone.
INSERT INTO public.subscriptions (id, organization_id, workspace_id, created_by, updated_by, name, amount, currency, billing_cycle, next_billing_date, category)
VALUES ('44000000-0000-4000-8000-00000000000a', '23000000-0000-4000-8000-00000000000a', '33000000-0000-4000-8000-00000000000a',
  '13000000-0000-4000-8000-00000000000a', '13000000-0000-4000-8000-00000000000a', 'Figma Pro', 29, 'EUR', 'monthly', current_date, 'productivity');
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.reminder_schedules WHERE source_type = 'subscription' AND source_id = '44000000-0000-4000-8000-00000000000a' AND trigger_type = 'due-today' AND status = 'pending'),
  'subscription due today receives a current pending milestone'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-00000000000a', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.reminder_schedules WHERE organization_id = '23000000-0000-4000-8000-00000000000a') > 0
  AND (SELECT count(*) FROM public.reminder_schedules WHERE organization_id = '23000000-0000-4000-8000-00000000000b') = 0,
  'schedule RLS exposes only the recipient tenant'
);
SELECT pg_temp.assert_true(
  NOT has_table_privilege('authenticated', 'public.reminder_schedules', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.reminder_schedules', 'UPDATE')
  AND NOT has_function_privilege('authenticated', 'public.process_due_reminders(integer)', 'EXECUTE'),
  'browser users cannot forge schedules or invoke the worker'
);
RESET ROLE;

-- Read acknowledgement cannot change an existing pending schedule.
INSERT INTO public.notifications (id, organization_id, user_id, type, title, category, priority)
VALUES ('53000000-0000-4000-8000-00000000000a', '23000000-0000-4000-8000-00000000000a', '13000000-0000-4000-8000-00000000000a', 'subscription', 'Due', 'subscription', 'critical');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '13000000-0000-4000-8000-00000000000a', true);
SELECT public.mark_all_visible_notifications_read('23000000-0000-4000-8000-00000000000a');
RESET ROLE;
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.reminder_schedules WHERE source_id = '44000000-0000-4000-8000-00000000000a' AND status = 'pending')
  AND (SELECT read_at IS NOT NULL FROM public.notifications WHERE id = '53000000-0000-4000-8000-00000000000a'),
  'mark-all changes delivery read state and leaves pending reminders intact'
);

-- The due-today milestone is scheduled at 09:00 in the organization timezone
-- (`reminder_execution_at`), i.e. 06:00 UTC for Europe/Chisinau in summer. Whether
-- it was already due therefore depended on the wall clock: this harness passed
-- only when CI happened to run after that hour, and failed every early-morning
-- run for a reason that had nothing to do with the change under test.
--
-- Make the row due explicitly instead. `scheduled_at <= now()` is exactly the
-- worker's claim condition, and moving only `scheduled_at` leaves `source_due_at`
-- untouched — so the worker's revalidation
-- (`reminder_execution_at(next_billing_date, …) = source_due_at`) still has to
-- hold for delivery to happen. The later milestones (overdue +1d/+3d) stay in the
-- future, so exactly one row is claimable and the "no duplicate" assertion below
-- keeps its meaning.
UPDATE public.reminder_schedules
SET scheduled_at = now() - interval '1 minute'
WHERE source_type = 'subscription'
  AND source_id = '44000000-0000-4000-8000-00000000000a'
  AND trigger_type = 'due-today'
  AND status = 'pending';

-- Pin the precondition: without it a future regression could leave zero rows due
-- and the delivery assertions would pass vacuously for the wrong reason.
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.reminder_schedules WHERE status = 'pending' AND scheduled_at <= now()) = 1,
  'exactly one milestone is due before the worker runs'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT pg_temp.assert_true(
  (public.backfill_reminder_schedules('23000000-0000-4000-8000-00000000000a', 100, true)->>'dry_run')::boolean,
  'controlled backfill supports a no-write dry run'
);
SELECT public.process_due_reminders(20);
SELECT public.process_due_reminders(20);
RESET ROLE;
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.reminder_schedules WHERE source_id = '44000000-0000-4000-8000-00000000000a' AND trigger_type = 'due-today' AND status = 'delivered')
  AND EXISTS (SELECT 1 FROM public.action_items WHERE source_type = 'subscription' AND source_id = '44000000-0000-4000-8000-00000000000a' AND status = 'open')
  AND EXISTS (SELECT 1 FROM public.notifications WHERE reminder_schedule_id IS NOT NULL AND user_id = '13000000-0000-4000-8000-00000000000a'),
  'worker atomically delivers one due milestone and leaves the obligation open'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.notifications WHERE reminder_schedule_id IS NOT NULL AND user_id = '13000000-0000-4000-8000-00000000000a') = 1,
  'a repeated cron run cannot duplicate a delivered milestone'
);

ROLLBACK;
