-- =============================================================================
-- Migration 012: SaaS Billing Layer
-- plans, billing_subscriptions, feature_flags, usage_records, invoices
--
-- NOTE: таблица называется billing_subscriptions (не subscriptions),
-- т.к. subscriptions уже занята модулем subtracker (трекинг SaaS-расходов).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- plans — доступные тарифные планы
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT        NOT NULL UNIQUE CHECK (slug IN ('free', 'pro', 'business', 'enterprise')),
  name             TEXT        NOT NULL,
  description      TEXT,
  price_monthly    NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly     NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency         TEXT        NOT NULL DEFAULT 'USD',
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Лимиты
  max_members      INT         NOT NULL DEFAULT 1,
  max_workspaces   INT         NOT NULL DEFAULT 1,
  max_tasks        INT         NOT NULL DEFAULT 100,
  max_deals        INT         NOT NULL DEFAULT 50,
  max_clients      INT         NOT NULL DEFAULT 50,
  max_documents    INT         NOT NULL DEFAULT 20,
  max_ai_calls_mo  INT         NOT NULL DEFAULT 10,
  max_storage_mb   INT         NOT NULL DEFAULT 100,

  -- Feature gates (NULL = unlimited, -1 = disabled, N = limit)
  features         JSONB       NOT NULL DEFAULT '{}',

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS handle_updated_at_plans ON plans;
CREATE TRIGGER handle_updated_at_plans
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Seed: базовые планы
INSERT INTO plans (slug, name, description, price_monthly, price_yearly,
  max_members, max_workspaces, max_tasks, max_deals, max_clients,
  max_documents, max_ai_calls_mo, max_storage_mb, features)
VALUES
  ('free',       'Free',       'For individuals and small teams',
    0,     0,
    3,  1, 100,  50,  50,   20,   10,   100,
    '{"crm": true, "documents": true, "analytics": false, "ai": false}'::jsonb),

  ('pro',        'Pro',        'For growing teams',
    29,  290,
    10, 3, 1000, 500, 500,  200,  100,  1000,
    '{"crm": true, "documents": true, "analytics": true, "ai": true}'::jsonb),

  ('business',   'Business',   'For established businesses',
    79,  790,
    50, 10, 10000, 5000, 5000, 2000, 500, 10000,
    '{"crm": true, "documents": true, "analytics": true, "ai": true, "api_access": true}'::jsonb),

  ('enterprise', 'Enterprise', 'Unlimited everything',
    299, 2990,
    -1, -1, -1, -1, -1, -1, -1, -1,
    '{"crm": true, "documents": true, "analytics": true, "ai": true, "api_access": true, "sso": true, "audit_export": true}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- billing_subscriptions — подписки организаций на тарифный план
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id           UUID        NOT NULL REFERENCES plans(id),
  status            TEXT        NOT NULL DEFAULT 'active' CHECK (status IN (
    'trialing', 'active', 'past_due', 'canceled', 'paused'
  )),
  billing_cycle     TEXT        NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  trial_ends_at     TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  canceled_at       TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN   NOT NULL DEFAULT FALSE,
  external_id       TEXT,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view billing subscription" ON billing_subscriptions;
CREATE POLICY "org members can view billing subscription"
  ON billing_subscriptions FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "admins can manage billing subscription" ON billing_subscriptions;
CREATE POLICY "admins can manage billing subscription"
  ON billing_subscriptions FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

DROP TRIGGER IF EXISTS handle_updated_at_billing_subscriptions ON billing_subscriptions;
CREATE TRIGGER handle_updated_at_billing_subscriptions
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- feature_flags — per-org переопределения фич
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flag_key         TEXT        NOT NULL CHECK (char_length(flag_key) BETWEEN 1 AND 100),
  is_enabled       BOOLEAN     NOT NULL DEFAULT TRUE,
  override_value   JSONB,
  reason           TEXT,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, flag_key)
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view feature flags" ON feature_flags;
CREATE POLICY "org members can view feature flags"
  ON feature_flags FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "admins can manage feature flags" ON feature_flags;
CREATE POLICY "admins can manage feature flags"
  ON feature_flags FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

DROP TRIGGER IF EXISTS handle_updated_at_feature_flags ON feature_flags;
CREATE TRIGGER handle_updated_at_feature_flags
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ---------------------------------------------------------------------------
-- usage_records — трекинг использования по метрикам
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric           TEXT        NOT NULL CHECK (metric IN (
    'members', 'workspaces', 'tasks', 'deals', 'clients',
    'documents', 'ai_calls', 'storage_mb'
  )),
  period_month     DATE        NOT NULL,
  quantity         INT         NOT NULL DEFAULT 0,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, metric, period_month)
);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view usage" ON usage_records;
CREATE POLICY "org members can view usage"
  ON usage_records FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "admins can manage usage" ON usage_records;
CREATE POLICY "admins can manage usage"
  ON usage_records FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- invoices — история оплат
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id  UUID        REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  amount           NUMERIC(10,2) NOT NULL,
  currency         TEXT        NOT NULL DEFAULT 'USD',
  status           TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'open', 'paid', 'void', 'uncollectible'
  )),
  billing_reason   TEXT        CHECK (billing_reason IN (
    'subscription_create', 'subscription_cycle', 'subscription_update', 'manual'
  )),
  period_start     TIMESTAMPTZ,
  period_end       TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  external_id      TEXT,
  pdf_url          TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members can view invoices" ON invoices;
CREATE POLICY "org members can view invoices"
  ON invoices FOR SELECT
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS "admins can manage invoices" ON invoices;
CREATE POLICY "admins can manage invoices"
  ON invoices FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- Функция: инициализировать Free-подписку для новой организации
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION init_free_subscription(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id UUID;
BEGIN
  SELECT id INTO v_plan_id FROM plans WHERE slug = 'free' LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN; END IF;

  INSERT INTO billing_subscriptions (
    organization_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end
  ) VALUES (
    p_org_id, v_plan_id, 'active', 'monthly',
    now(), now() + INTERVAL '100 years'
  )
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org
  ON billing_subscriptions (organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_plan
  ON billing_subscriptions (plan_id);

CREATE INDEX IF NOT EXISTS idx_feature_flags_org_key
  ON feature_flags (organization_id, flag_key);

CREATE INDEX IF NOT EXISTS idx_usage_records_org_period
  ON usage_records (organization_id, period_month DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_org
  ON invoices (organization_id, created_at DESC);
