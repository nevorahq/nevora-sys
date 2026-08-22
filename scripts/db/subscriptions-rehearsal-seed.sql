\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) VALUES (
  '95000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'subscriptions-rehearsal@example.test',
  'local-rehearsal-only',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, plan)
VALUES (
  '96000000-0000-4000-8000-000000000001',
  'Subscriptions Local Rehearsal',
  'subscriptions-local-rehearsal',
  'pro'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, plan = EXCLUDED.plan, updated_at = now();

INSERT INTO public.memberships (user_id, organization_id, role, status)
VALUES (
  '95000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  'owner',
  'active'
)
ON CONFLICT (user_id, organization_id) DO UPDATE
SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now();

INSERT INTO public.workspaces (id, organization_id, name, type, is_default, slug)
VALUES (
  '97000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  'General',
  'default',
  true,
  'general'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, is_default = true, updated_at = now();

INSERT INTO public.billing_subscriptions (
  id,
  organization_id,
  plan_id,
  status,
  billing_cycle,
  current_period_start,
  current_period_end
)
SELECT
  '98000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  p.id,
  'active',
  'monthly',
  now(),
  now() + interval '1 month'
FROM public.plans p
WHERE p.code = 'pro'
ON CONFLICT (organization_id) DO UPDATE
SET plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();

-- The subscription under test: active, auto_task_enabled, due today, so the
-- rehearsal's createSubscriptionPaymentCycle -> createSubscriptionPaymentTaskForCycle
-- calls have real data to work against.
INSERT INTO public.subscriptions (
  id,
  user_id,
  organization_id,
  workspace_id,
  created_by,
  updated_by,
  name,
  amount,
  currency,
  billing_cycle,
  billing_anchor_day,
  next_billing_date,
  auto_task_enabled,
  is_active
)
VALUES (
  '99000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  '95000000-0000-4000-8000-000000000001',
  'Subscriptions runtime rehearsal',
  9.99,
  'USD',
  'monthly',
  extract(day from current_date)::smallint,
  current_date,
  true,
  true
)
ON CONFLICT (id) DO UPDATE
SET next_billing_date = EXCLUDED.next_billing_date,
    is_active = true,
    auto_task_enabled = true,
    updated_at = now();

COMMIT;
