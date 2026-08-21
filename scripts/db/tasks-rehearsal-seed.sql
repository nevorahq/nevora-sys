\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) VALUES (
  '91000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'tasks-rehearsal@example.test',
  'local-rehearsal-only',
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, plan)
VALUES (
  '92000000-0000-4000-8000-000000000001',
  'Tasks Local Rehearsal',
  'tasks-local-rehearsal',
  'pro'
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, plan = EXCLUDED.plan, updated_at = now();

INSERT INTO public.memberships (user_id, organization_id, role, status)
VALUES (
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'owner',
  'active'
)
ON CONFLICT (user_id, organization_id) DO UPDATE
SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now();

INSERT INTO public.workspaces (id, organization_id, name, type, is_default, slug)
VALUES (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
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
  '94000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
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

COMMIT;
