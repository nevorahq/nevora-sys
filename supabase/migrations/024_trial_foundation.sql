-- =============================================================================
-- Migration 024: Trial Foundation (Block 1)
--
-- Цель: привести тарифную модель к лендингу и сделать 14-дневный trial
-- состоянием по умолчанию для новых организаций.
--
-- Решения (согласованы):
--   1. Источник правды для плана/триала = billing_subscriptions + plans
--      (переиспользуем существующий billing-слой, не плодим параллельные
--      таблицы trial_* / usage_counters из roadmap).
--   2. Каноничные активные планы = trial / start / pro / business (EUR),
--      лимиты из лендинга/roadmap. free и enterprise → is_active = false
--      (legacy: существующие подписки на них grandfathered, не ломаем).
--   3. Онбординг создаёт trialing-подписку на 14 дней вместо free-forever.
--
-- Что НЕ входит в Block 1 (следующие блоки):
--   - enforcement ai_calls / storage / subscriptions / money_transactions
--     в lib/billing/check-limit.ts (Block 3);
--   - trial lifecycle expiration + read-only (Block 4);
--   - UX баннеры/usage (Block 5).
--
-- Никакого billing/checkout/Stripe — только trial state.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. organizations.plan — расширяем CHECK (была только free/pro/enterprise),
--    дефолт на 'trial'. organizations.plan теперь legacy-зеркало:
--    источник правды — billing_subscriptions. Не удаляем колонку, чтобы не
--    ломать существующий код/строки.
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('trial', 'start', 'free', 'pro', 'business', 'enterprise'));

ALTER TABLE public.organizations
  ALTER COLUMN plan SET DEFAULT 'trial';

-- ---------------------------------------------------------------------------
-- 2. plans — новые измерения лимитов + расширение slug CHECK + reseed
-- ---------------------------------------------------------------------------

-- Новые лимиты (roadmap). DEFAULT-ы щедрые, чтобы legacy free/pro/enterprise
-- строки не начали блокировать grandfathered организации.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_subscriptions      INT NOT NULL DEFAULT 100;
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_money_transactions INT NOT NULL DEFAULT 1000;

-- slug CHECK: добавляем trial / start (сохраняем legacy free/enterprise)
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_slug_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_slug_check
  CHECK (slug IN ('trial', 'start', 'free', 'pro', 'business', 'enterprise'));

-- Reseed каноничных планов (EUR). price_yearly = monthly × 12 как честный
-- placeholder (без выдуманной скидки) — годовой биллинг вне scope (Not now).
-- Лимит max_* = жёсткий потолок (для members это "до N", расчёт доплат за
-- участников — billing-логика, тоже вне scope).
INSERT INTO public.plans (
  slug, name, description, price_monthly, price_yearly, currency, is_active,
  max_members, max_workspaces, max_tasks, max_deals, max_clients,
  max_documents, max_subscriptions, max_money_transactions,
  max_ai_calls_mo, max_storage_mb, features
) VALUES
  -- trial: назначается только провижинингом, в upgrade-списке не участвует
  ('trial', 'Free Trial', 'Временный 14-дневный доступ для проверки продукта',
    0, 0, 'EUR', FALSE,
    2,  1,  100,  25,  50,
    25, 10, 100,
    25, 500,
    '{"crm": true, "documents": true, "analytics": true, "ai": true, "preview": true}'::jsonb),

  ('start', 'Start', 'Для solo-пользователей, которые хотят организовать работу без сложности.',
    9, 108, 'EUR', TRUE,
    3,  1,  500,  50,  100,
    100, 25, 500,
    50, 1024,
    '{"crm": true, "documents": true, "analytics": true, "ai": true}'::jsonb),

  ('pro', 'Pro', 'Для профессионалов и небольших команд, которым нужна структура и видимость.',
    29, 348, 'EUR', TRUE,
    8,  3,  5000, 1000, 2000,
    2000, 250, 10000,
    300, 10240,
    '{"crm": true, "documents": true, "analytics": true, "ai": true}'::jsonb),

  ('business', 'Business', 'Для команд, которым нужен общий бизнес-workspace с большим контролем.',
    69, 828, 'EUR', TRUE,
    30, 10, 25000, 5000, 10000,
    10000, 1000, 50000,
    1500, 51200,
    '{"crm": true, "documents": true, "analytics": true, "ai": true, "audit_export": true, "api_access": true}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name                   = EXCLUDED.name,
  description            = EXCLUDED.description,
  price_monthly          = EXCLUDED.price_monthly,
  price_yearly           = EXCLUDED.price_yearly,
  currency               = EXCLUDED.currency,
  is_active              = EXCLUDED.is_active,
  max_members            = EXCLUDED.max_members,
  max_workspaces         = EXCLUDED.max_workspaces,
  max_tasks              = EXCLUDED.max_tasks,
  max_deals              = EXCLUDED.max_deals,
  max_clients            = EXCLUDED.max_clients,
  max_documents          = EXCLUDED.max_documents,
  max_subscriptions      = EXCLUDED.max_subscriptions,
  max_money_transactions = EXCLUDED.max_money_transactions,
  max_ai_calls_mo        = EXCLUDED.max_ai_calls_mo,
  max_storage_mb         = EXCLUDED.max_storage_mb,
  features               = EXCLUDED.features,
  updated_at             = now();

-- Деактивируем планы, которых нет на лендинге (строки сохраняем для legacy FK)
UPDATE public.plans
  SET is_active = FALSE, updated_at = now()
  WHERE slug IN ('free', 'enterprise');

-- ---------------------------------------------------------------------------
-- 3. usage_records.metric — добавляем subscriptions / money_transactions
-- ---------------------------------------------------------------------------
ALTER TABLE public.usage_records
  DROP CONSTRAINT IF EXISTS usage_records_metric_check;
ALTER TABLE public.usage_records
  ADD CONSTRAINT usage_records_metric_check
  CHECK (metric IN (
    'members', 'workspaces', 'tasks', 'deals', 'clients',
    'documents', 'subscriptions', 'money_transactions',
    'ai_calls', 'storage_mb'
  ));

-- ---------------------------------------------------------------------------
-- 4. init_trial_subscription() — провижининг trialing-подписки на 14 дней
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.init_trial_subscription(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  SELECT id INTO v_plan_id FROM public.plans WHERE slug = 'trial' LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.billing_subscriptions (
    organization_id, plan_id, status, billing_cycle,
    trial_ends_at, current_period_start, current_period_end
  ) VALUES (
    p_org_id, v_plan_id, 'trialing', 'monthly',
    now() + INTERVAL '14 days', now(), now() + INTERVAL '14 days'
  )
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.init_trial_subscription(UUID) IS
  '14-дневная trialing-подписка на план trial. Вызывается из create_organization.';

-- ---------------------------------------------------------------------------
-- 5. create_organization() — теперь стартует trial вместо free-forever
--    (переопределяем функцию из 005, добавляя провижининг подписки)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_slug TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id   UUID;
  v_user_id  UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  -- 1. Организация (plan = legacy-зеркало, источник правды — подписка)
  INSERT INTO public.organizations (name, slug, plan)
  VALUES (trim(p_name), lower(trim(p_slug)), 'trial')
  RETURNING id INTO v_org_id;

  -- 2. Owner membership
  INSERT INTO public.memberships (user_id, organization_id, role, status)
  VALUES (v_user_id, v_org_id, 'owner', 'active');

  -- 3. Default workspace
  INSERT INTO public.workspaces (organization_id, name, slug, type, is_default)
  VALUES (v_org_id, 'General', lower(trim(p_slug)) || '-general', 'default', true);

  -- 4. 14-дневная trial-подписка
  PERFORM public.init_trial_subscription(v_org_id);

  RETURN v_org_id;
END;
$$;

COMMENT ON FUNCTION public.create_organization(TEXT, TEXT) IS
  'Atomically creates org + owner membership + default workspace + 14-day trial '
  'subscription. Called from onboarding Server Action. SECURITY DEFINER for RLS bootstrap.';
