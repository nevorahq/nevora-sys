-- Run after migration 117. Fixtures are disposable and roll back.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION '%', message; END IF; END $$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('16000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'renewal-owner@example.test', 'x', now(), now(), now());
INSERT INTO public.organizations (id, name, slug, plan, timezone)
VALUES ('26000000-0000-4000-8000-000000000001', 'Renewal Test', 'renewal-test', 'free', 'Europe/Chisinau');
INSERT INTO public.memberships (user_id, organization_id, role, status)
VALUES ('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'owner', 'active');
INSERT INTO public.workspaces (id, organization_id, name, type, is_default)
VALUES ('36000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001', 'Default', 'default', true);

INSERT INTO public.subscriptions (
  id, organization_id, workspace_id, created_by, updated_by, name, amount,
  currency, billing_cycle, next_billing_date, category, auto_renews,
  renewal_reminder_days
) VALUES (
  '46000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  '16000000-0000-4000-8000-000000000001',
  'Design Cloud', 20, 'EUR', 'monthly', current_date + 20,
  'productivity', true, 7
);

SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.subscription_renewal_cases
   WHERE subscription_id = '46000000-0000-4000-8000-000000000001') = 1,
  'subscription insert provisions exactly one renewal case'
);
SELECT pg_temp.assert_true(
  (SELECT decision_due_date = current_date + 13
   FROM public.subscription_renewal_cases
   WHERE subscription_id = '46000000-0000-4000-8000-000000000001'),
  'decision date is derived from the configured lead time'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.action_items
   WHERE type = 'renewal_required'
     AND source_type = 'subscription'
     AND source_id = '46000000-0000-4000-8000-000000000001') = 1,
  'renewal case projects one Action Center item'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.reminder_schedules
   WHERE source_type = 'subscription'
     AND source_id = '46000000-0000-4000-8000-000000000001'
     AND status = 'pending') = 3,
  'renewal decision schedules exactly three durable milestones'
);

INSERT INTO public.notifications (
  id, organization_id, workspace_id, user_id, type, title, body,
  action_item_id, category, priority
)
SELECT
  '56000000-0000-4000-8000-000000000001',
  ai.organization_id, ai.workspace_id,
  '16000000-0000-4000-8000-000000000001',
  'subscription', 'Legacy title', 'Legacy body', ai.id, 'subscription', 'high'
FROM public.action_items ai
WHERE ai.type = 'renewal_required'
  AND ai.source_id = '46000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT target_url = '/subscriptions/46000000-0000-4000-8000-000000000001'
      AND title = 'Renewal decision: Design Cloud'
   FROM public.notifications
   WHERE id = '56000000-0000-4000-8000-000000000001'),
  'subscription reminder deep-links to the exact renewal decision surface'
);

-- Date edits reconcile the unresolved case instead of leaving duplicate work.
UPDATE public.subscriptions
SET next_billing_date = current_date + 25
WHERE id = '46000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.subscription_renewal_cases
   WHERE subscription_id = '46000000-0000-4000-8000-000000000001') = 1
  AND (SELECT renewal_date = current_date + 25
       FROM public.subscription_renewal_cases
       WHERE subscription_id = '46000000-0000-4000-8000-000000000001'),
  'unresolved case follows a changed billing date idempotently'
);

UPDATE public.subscription_renewal_cases
SET status = 'keep', decided_at = now(), decided_by = '16000000-0000-4000-8000-000000000001'
WHERE subscription_id = '46000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  EXISTS (SELECT 1 FROM public.action_items
    WHERE source_id = '46000000-0000-4000-8000-000000000001'
      AND type = 'renewal_required' AND status = 'resolved')
  AND NOT EXISTS (SELECT 1 FROM public.reminder_schedules
    WHERE source_id = '46000000-0000-4000-8000-000000000001'
      AND status IN ('pending', 'processing')),
  'resolved renewal decision resolves attention and cancels future reminders'
);

-- Advancing the subscription after a resolved decision preserves history and
-- creates the next period case without copying the prior decision.
UPDATE public.subscriptions
SET next_billing_date = current_date + 55
WHERE id = '46000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.subscription_renewal_cases
   WHERE subscription_id = '46000000-0000-4000-8000-000000000001') = 2
  AND EXISTS (SELECT 1 FROM public.subscription_renewal_cases
    WHERE subscription_id = '46000000-0000-4000-8000-000000000001'
      AND renewal_date = current_date + 55 AND status = 'pending'),
  'resolved history survives rollover and the next case starts pending'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '16000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.subscription_renewal_cases
   WHERE organization_id = '26000000-0000-4000-8000-000000000001') = 2,
  'organization member can read own renewal history'
);
RESET ROLE;

ROLLBACK;
