-- =============================================================================
-- Migration 071: Phase 6 Billing, Plans, Limits, Developer Access
--
-- Extends the existing billing spine instead of creating a parallel subscription
-- system. Source of truth remains:
--   - public.plans
--   - public.billing_subscriptions
--
-- New normalized plan tables and developer-access tables are added around it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Plans: Phase 6 compatibility columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;

UPDATE public.plans
SET code = slug
WHERE code IS NULL;

ALTER TABLE public.plans
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS plans_code_key ON public.plans(code);

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_code_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_code_check
  CHECK (code IN ('trial', 'start', 'free', 'pro', 'business', 'enterprise'));

UPDATE public.plans SET sort_order = CASE code
  WHEN 'trial' THEN 10
  WHEN 'start' THEN 20
  WHEN 'pro' THEN 30
  WHEN 'business' THEN 40
  WHEN 'free' THEN 90
  ELSE 100
END;

-- Phase 6 canonical seed. Existing legacy free/enterprise rows remain inactive.
INSERT INTO public.plans (
  slug, code, name, description, price_monthly, price_yearly, currency,
  is_active, sort_order,
  max_members, max_workspaces, max_tasks, max_deals, max_clients,
  max_documents, max_subscriptions, max_money_transactions,
  max_ai_calls_mo, max_storage_mb, included_members, extra_member_price,
  features
) VALUES
  ('trial', 'trial', 'Free Trial', '14-day product trial',
    0, 0, 'USD', true, 10,
    2, 1, 100, 25, 50, 25, 10, 100, 20, 500, 1, 0,
    '{"tasks.enabled": true, "documents.enabled": true, "money.enabled": true, "subscriptions.enabled": true, "analytics.enabled": true, "ai.enabled": true, "developer_access.enabled": false, "public_api.enabled": false, "developer_webhooks.enabled": false}'::jsonb),
  ('start', 'start', 'Start', 'For solo operators and very small teams',
    9, 108, 'USD', true, 20,
    3, 1, 500, 50, 100, 100, 25, 500, 50, 1024, 1, 5,
    '{"tasks.enabled": true, "documents.enabled": true, "money.enabled": true, "subscriptions.enabled": true, "analytics.enabled": true, "ai.enabled": true, "developer_access.enabled": false, "public_api.enabled": false, "developer_webhooks.enabled": false}'::jsonb),
  ('pro', 'pro', 'Pro', 'For professionals and growing teams',
    29, 348, 'USD', true, 30,
    10, 3, 5000, 1000, 2000, 1000, 250, 5000, 500, 10240, 1, 0,
    '{"tasks.enabled": true, "documents.enabled": true, "money.enabled": true, "subscriptions.enabled": true, "analytics.enabled": true, "ai.enabled": true, "developer_access.enabled": true, "public_api.enabled": true, "developer_webhooks.enabled": true}'::jsonb),
  ('business', 'business', 'Business', 'For teams that need higher limits and developer workflows',
    69, 828, 'USD', true, 40,
    -1, 10, -1, 5000, 10000, -1, -1, -1, -1, -1, 1, 0,
    '{"tasks.enabled": true, "documents.enabled": true, "money.enabled": true, "subscriptions.enabled": true, "analytics.enabled": true, "ai.enabled": true, "developer_access.enabled": true, "public_api.enabled": true, "developer_webhooks.enabled": true}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  currency = EXCLUDED.currency,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  max_members = EXCLUDED.max_members,
  max_workspaces = EXCLUDED.max_workspaces,
  max_tasks = EXCLUDED.max_tasks,
  max_deals = EXCLUDED.max_deals,
  max_clients = EXCLUDED.max_clients,
  max_documents = EXCLUDED.max_documents,
  max_subscriptions = EXCLUDED.max_subscriptions,
  max_money_transactions = EXCLUDED.max_money_transactions,
  max_ai_calls_mo = EXCLUDED.max_ai_calls_mo,
  max_storage_mb = EXCLUDED.max_storage_mb,
  included_members = EXCLUDED.included_members,
  extra_member_price = EXCLUDED.extra_member_price,
  features = EXCLUDED.features,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Billing subscriptions: Phase 6 provider fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;

UPDATE public.billing_subscriptions
SET trial_end = COALESCE(trial_end, trial_ends_at),
    trial_start = COALESCE(trial_start, current_period_start)
WHERE status = 'trialing';

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_status_check;
ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'paused', 'expired', 'free'));

-- Compatibility read model for Phase 6 naming. Do not write through this view.
CREATE OR REPLACE VIEW public.organization_subscriptions
WITH (security_invoker = true)
AS
SELECT
  bs.id,
  bs.organization_id,
  bs.plan_id,
  bs.status,
  bs.billing_provider,
  bs.provider_customer_id,
  COALESCE(bs.provider_subscription_id, bs.external_id) AS provider_subscription_id,
  bs.current_period_start,
  bs.current_period_end,
  bs.trial_start,
  COALESCE(bs.trial_end, bs.trial_ends_at) AS trial_end,
  bs.cancel_at_period_end,
  bs.created_at,
  bs.updated_at
FROM public.billing_subscriptions bs;

GRANT SELECT ON public.organization_subscriptions TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Normalized plan entitlements and limits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  value JSONB NOT NULL DEFAULT 'true'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, key)
);

CREATE TABLE IF NOT EXISTS public.plan_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  value NUMERIC,
  period TEXT NOT NULL DEFAULT 'lifetime' CHECK (period IN ('lifetime', 'monthly', 'daily', 'minute')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, key, period)
);

ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_entitlements_select" ON public.plan_entitlements;
CREATE POLICY "plan_entitlements_select"
  ON public.plan_entitlements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "plan_limits_select" ON public.plan_limits;
CREATE POLICY "plan_limits_select"
  ON public.plan_limits FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS handle_updated_at_plan_entitlements ON public.plan_entitlements;
CREATE TRIGGER handle_updated_at_plan_entitlements
  BEFORE UPDATE ON public.plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_plan_limits ON public.plan_limits;
CREATE TRIGGER handle_updated_at_plan_limits
  BEFORE UPDATE ON public.plan_limits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS plan_entitlements_plan_key_idx
  ON public.plan_entitlements(plan_id, key);

CREATE INDEX IF NOT EXISTS plan_limits_plan_key_idx
  ON public.plan_limits(plan_id, key, period);

WITH entitlement_seed(plan_code, key, value) AS (
  VALUES
    ('trial', 'tasks.enabled', 'true'::jsonb),
    ('trial', 'documents.enabled', 'true'::jsonb),
    ('trial', 'money.enabled', 'true'::jsonb),
    ('trial', 'subscriptions.enabled', 'true'::jsonb),
    ('trial', 'analytics.enabled', 'true'::jsonb),
    ('trial', 'ai.enabled', 'true'::jsonb),
    ('trial', 'developer_access.enabled', 'false'::jsonb),
    ('trial', 'public_api.enabled', 'false'::jsonb),
    ('trial', 'developer_webhooks.enabled', 'false'::jsonb),
    ('start', 'tasks.enabled', 'true'::jsonb),
    ('start', 'documents.enabled', 'true'::jsonb),
    ('start', 'money.enabled', 'true'::jsonb),
    ('start', 'subscriptions.enabled', 'true'::jsonb),
    ('start', 'analytics.enabled', 'true'::jsonb),
    ('start', 'ai.enabled', 'true'::jsonb),
    ('start', 'developer_access.enabled', 'false'::jsonb),
    ('start', 'public_api.enabled', 'false'::jsonb),
    ('start', 'developer_webhooks.enabled', 'false'::jsonb),
    ('pro', 'tasks.enabled', 'true'::jsonb),
    ('pro', 'documents.enabled', 'true'::jsonb),
    ('pro', 'money.enabled', 'true'::jsonb),
    ('pro', 'subscriptions.enabled', 'true'::jsonb),
    ('pro', 'analytics.enabled', 'true'::jsonb),
    ('pro', 'ai.enabled', 'true'::jsonb),
    ('pro', 'developer_access.enabled', 'true'::jsonb),
    ('pro', 'public_api.enabled', 'true'::jsonb),
    ('pro', 'developer_webhooks.enabled', 'true'::jsonb),
    ('business', 'tasks.enabled', 'true'::jsonb),
    ('business', 'documents.enabled', 'true'::jsonb),
    ('business', 'money.enabled', 'true'::jsonb),
    ('business', 'subscriptions.enabled', 'true'::jsonb),
    ('business', 'analytics.enabled', 'true'::jsonb),
    ('business', 'ai.enabled', 'true'::jsonb),
    ('business', 'developer_access.enabled', 'true'::jsonb),
    ('business', 'public_api.enabled', 'true'::jsonb),
    ('business', 'developer_webhooks.enabled', 'true'::jsonb)
)
INSERT INTO public.plan_entitlements(plan_id, key, value)
SELECT p.id, s.key, s.value
FROM entitlement_seed s
JOIN public.plans p ON p.code = s.plan_code
ON CONFLICT (plan_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

WITH limit_seed(plan_code, key, value, period) AS (
  VALUES
    ('trial', 'members.count', 2::numeric, 'lifetime'),
    ('trial', 'storage.bytes', 524288000::numeric, 'lifetime'),
    ('trial', 'tasks.count', 100::numeric, 'lifetime'),
    ('trial', 'documents.count', 25::numeric, 'lifetime'),
    ('trial', 'subscriptions.count', 10::numeric, 'lifetime'),
    ('trial', 'money_transactions.count', 100::numeric, 'lifetime'),
    ('trial', 'ai_requests.monthly', 20::numeric, 'monthly'),
    ('start', 'members.count', 3::numeric, 'lifetime'),
    ('start', 'storage.bytes', 1073741824::numeric, 'lifetime'),
    ('start', 'tasks.count', 500::numeric, 'lifetime'),
    ('start', 'documents.count', 100::numeric, 'lifetime'),
    ('start', 'subscriptions.count', 25::numeric, 'lifetime'),
    ('start', 'money_transactions.count', 500::numeric, 'lifetime'),
    ('start', 'ai_requests.monthly', 50::numeric, 'monthly'),
    ('pro', 'members.count', 10::numeric, 'lifetime'),
    ('pro', 'storage.bytes', 10737418240::numeric, 'lifetime'),
    ('pro', 'tasks.count', 5000::numeric, 'lifetime'),
    ('pro', 'documents.count', 1000::numeric, 'lifetime'),
    ('pro', 'subscriptions.count', 250::numeric, 'lifetime'),
    ('pro', 'money_transactions.count', 5000::numeric, 'lifetime'),
    ('pro', 'ai_requests.monthly', 500::numeric, 'monthly'),
    ('pro', 'api_requests.monthly', 10000::numeric, 'monthly'),
    ('pro', 'api_requests.minute', 120::numeric, 'minute'),
    ('pro', 'developer_api_keys.count', 5::numeric, 'lifetime'),
    ('pro', 'developer_webhooks.count', 5::numeric, 'lifetime'),
    ('business', 'members.count', NULL::numeric, 'lifetime'),
    ('business', 'storage.bytes', NULL::numeric, 'lifetime'),
    ('business', 'tasks.count', NULL::numeric, 'lifetime'),
    ('business', 'documents.count', NULL::numeric, 'lifetime'),
    ('business', 'subscriptions.count', NULL::numeric, 'lifetime'),
    ('business', 'money_transactions.count', NULL::numeric, 'lifetime'),
    ('business', 'ai_requests.monthly', NULL::numeric, 'monthly'),
    ('business', 'api_requests.monthly', NULL::numeric, 'monthly'),
    ('business', 'api_requests.minute', NULL::numeric, 'minute'),
    ('business', 'developer_api_keys.count', NULL::numeric, 'lifetime'),
    ('business', 'developer_webhooks.count', NULL::numeric, 'lifetime')
)
INSERT INTO public.plan_limits(plan_id, key, value, period)
SELECT p.id, s.key, s.value, s.period
FROM limit_seed s
JOIN public.plans p ON p.code = s.plan_code
ON CONFLICT (plan_id, key, period) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Organization usage counters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  value NUMERIC NOT NULL DEFAULT 0 CHECK (value >= 0),
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key, period_start)
);

ALTER TABLE public.organization_usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organization_usage_counters_select" ON public.organization_usage_counters;
CREATE POLICY "organization_usage_counters_select"
  ON public.organization_usage_counters FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "organization_usage_counters_admin_all" ON public.organization_usage_counters;
CREATE POLICY "organization_usage_counters_admin_all"
  ON public.organization_usage_counters FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE INDEX IF NOT EXISTS organization_usage_counters_org_key_idx
  ON public.organization_usage_counters(organization_id, key, period_start DESC);

CREATE UNIQUE INDEX IF NOT EXISTS organization_usage_counters_org_key_period_unique_idx
  ON public.organization_usage_counters(organization_id, key, period_start) NULLS NOT DISTINCT;

-- ---------------------------------------------------------------------------
-- 5. Developer API keys and webhooks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  key_hash TEXT NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  key_prefix TEXT NOT NULL CHECK (char_length(key_prefix) BETWEEN 8 AND 32),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.developer_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (url ~ '^https://'),
  secret_hash TEXT NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.developer_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES public.developer_webhooks(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.domain_events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'retrying')),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  response_status INT,
  response_body TEXT,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "developer_api_keys_select" ON public.developer_api_keys;
CREATE POLICY "developer_api_keys_select"
  ON public.developer_api_keys FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "developer_api_keys_insert" ON public.developer_api_keys;
CREATE POLICY "developer_api_keys_insert"
  ON public.developer_api_keys FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "developer_api_keys_update" ON public.developer_api_keys;
CREATE POLICY "developer_api_keys_update"
  ON public.developer_api_keys FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "developer_webhooks_select" ON public.developer_webhooks;
CREATE POLICY "developer_webhooks_select"
  ON public.developer_webhooks FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "developer_webhooks_insert" ON public.developer_webhooks;
CREATE POLICY "developer_webhooks_insert"
  ON public.developer_webhooks FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_admin(organization_id)
  );

DROP POLICY IF EXISTS "developer_webhooks_update" ON public.developer_webhooks;
CREATE POLICY "developer_webhooks_update"
  ON public.developer_webhooks FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "developer_webhooks_delete" ON public.developer_webhooks;
CREATE POLICY "developer_webhooks_delete"
  ON public.developer_webhooks FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "developer_webhook_deliveries_select" ON public.developer_webhook_deliveries;
CREATE POLICY "developer_webhook_deliveries_select"
  ON public.developer_webhook_deliveries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.developer_webhooks wh
      WHERE wh.id = webhook_id
        AND public.is_org_member(wh.organization_id)
    )
  );

DROP TRIGGER IF EXISTS handle_updated_at_developer_api_keys ON public.developer_api_keys;
CREATE TRIGGER handle_updated_at_developer_api_keys
  BEFORE UPDATE ON public.developer_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_developer_webhooks ON public.developer_webhooks;
CREATE TRIGGER handle_updated_at_developer_webhooks
  BEFORE UPDATE ON public.developer_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_developer_webhook_deliveries ON public.developer_webhook_deliveries;
CREATE TRIGGER handle_updated_at_developer_webhook_deliveries
  BEFORE UPDATE ON public.developer_webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS developer_api_keys_org_idx
  ON public.developer_api_keys(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS developer_webhooks_org_idx
  ON public.developer_webhooks(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS developer_webhook_deliveries_webhook_idx
  ON public.developer_webhook_deliveries(webhook_id, created_at DESC);

-- Explicit PostgREST privileges. RLS remains the tenant boundary; grants only
-- make the intended policies reachable for authenticated users.
GRANT SELECT ON public.plans TO authenticated;
GRANT SELECT ON public.plan_entitlements TO authenticated;
GRANT SELECT ON public.plan_limits TO authenticated;
GRANT SELECT ON public.billing_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_usage_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.developer_api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.developer_webhooks TO authenticated;
GRANT SELECT ON public.developer_webhook_deliveries TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Public API key validation and usage tracking RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_developer_api_key(
  p_key_hash TEXT
)
RETURNS TABLE (
  api_key_id UUID,
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  plan_code TEXT,
  scopes TEXT[],
  rejection_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT
    k.id,
    k.organization_id,
    o.name,
    o.slug,
    p.code,
    k.scopes,
    CASE
      WHEN COALESCE(developer_access.value, 'false'::jsonb) <> 'true'::jsonb THEN 'developer_access_required'
      WHEN COALESCE(public_api.value, 'false'::jsonb) <> 'true'::jsonb THEN 'public_api_required'
      WHEN NOT public.is_organization_writable(k.organization_id) THEN 'subscription_not_writable'
      ELSE NULL
    END
  FROM public.developer_api_keys k
  JOIN public.organizations o ON o.id = k.organization_id
  JOIN public.billing_subscriptions bs ON bs.organization_id = k.organization_id
  JOIN public.plans p ON p.id = bs.plan_id
  LEFT JOIN public.plan_entitlements developer_access
    ON developer_access.plan_id = p.id
   AND developer_access.key = 'developer_access.enabled'
  LEFT JOIN public.plan_entitlements public_api
    ON public_api.plan_id = p.id
   AND public_api.key = 'public_api.enabled'
  WHERE k.key_hash = p_key_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now())
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_developer_api_key(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_developer_api_key(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_developer_api_key_used(
  p_api_key_id UUID
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.developer_api_keys
  SET last_used_at = now(), updated_at = now()
  WHERE id = p_api_key_id
    AND revoked_at IS NULL
    AND public.is_org_member(organization_id);
$$;

REVOKE ALL ON FUNCTION public.mark_developer_api_key_used(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_developer_api_key_used(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_organization_usage_counter(
  p_organization_id UUID,
  p_key TEXT,
  p_increment NUMERIC DEFAULT 1,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_value NUMERIC;
  v_period_start TIMESTAMPTZ := COALESCE(p_period_start, '-infinity'::timestamptz);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_increment < 0 THEN
    RAISE EXCEPTION 'usage_increment_must_be_positive';
  END IF;

  INSERT INTO public.organization_usage_counters (
    organization_id, key, value, period_start, period_end, updated_at
  ) VALUES (
    p_organization_id, p_key, p_increment, v_period_start, p_period_end, now()
  )
  ON CONFLICT (organization_id, key, period_start)
  DO UPDATE SET
    value = public.organization_usage_counters.value + EXCLUDED.value,
    period_end = COALESCE(EXCLUDED.period_end, public.organization_usage_counters.period_end),
    updated_at = now()
  RETURNING value INTO v_value;

  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_organization_usage_counter(UUID, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_organization_usage_counter(UUID, TEXT, NUMERIC, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_plan_limit_for_organization(
  p_organization_id UUID,
  p_key TEXT,
  p_period TEXT
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT pl.value
  FROM public.billing_subscriptions bs
  JOIN public.plan_limits pl ON pl.plan_id = bs.plan_id
  WHERE bs.organization_id = p_organization_id
    AND public.is_org_member(p_organization_id)
    AND pl.key = p_key
    AND pl.period = p_period
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_plan_limit_for_organization(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_plan_limit_for_organization(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_organization_usage_counter_value(
  p_organization_id UUID,
  p_key TEXT,
  p_period_start TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT c.value
    FROM public.organization_usage_counters c
    WHERE c.organization_id = p_organization_id
      AND public.is_org_member(p_organization_id)
      AND c.key = p_key
      AND c.period_start = COALESCE(p_period_start, '-infinity'::timestamptz)
    LIMIT 1
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.get_organization_usage_counter_value(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organization_usage_counter_value(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_developer_api_rate_state(
  p_api_key_id UUID,
  p_key_hash TEXT,
  p_period_start TIMESTAMPTZ
)
RETURNS TABLE (
  monthly_limit NUMERIC,
  minute_limit NUMERIC,
  monthly_used NUMERIC,
  minute_used NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT
    monthly_limit.value,
    minute_limit.value,
    COALESCE(monthly_counter.value, 0),
    COALESCE(minute_counter.value, 0)
  FROM public.developer_api_keys k
  JOIN public.billing_subscriptions bs ON bs.organization_id = k.organization_id
  JOIN public.plan_entitlements developer_access
    ON developer_access.plan_id = bs.plan_id
   AND developer_access.key = 'developer_access.enabled'
   AND developer_access.value = 'true'::jsonb
  JOIN public.plan_entitlements public_api
    ON public_api.plan_id = bs.plan_id
   AND public_api.key = 'public_api.enabled'
   AND public_api.value = 'true'::jsonb
  LEFT JOIN public.plan_limits monthly_limit
    ON monthly_limit.plan_id = bs.plan_id
   AND monthly_limit.key = 'api_requests.monthly'
   AND monthly_limit.period = 'monthly'
  LEFT JOIN public.plan_limits minute_limit
    ON minute_limit.plan_id = bs.plan_id
   AND minute_limit.key = 'api_requests.minute'
   AND minute_limit.period = 'minute'
  LEFT JOIN public.organization_usage_counters monthly_counter
    ON monthly_counter.organization_id = k.organization_id
   AND monthly_counter.key = 'api_requests.monthly'
   AND monthly_counter.period_start = date_trunc('month', p_period_start)
  LEFT JOIN public.organization_usage_counters minute_counter
    ON minute_counter.organization_id = k.organization_id
   AND minute_counter.key = 'api_requests.minute'
   AND minute_counter.period_start = date_trunc('minute', p_period_start)
  WHERE k.id = p_api_key_id
    AND k.key_hash = p_key_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now())
    AND public.is_organization_writable(k.organization_id)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_developer_api_rate_state(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_developer_api_rate_state(UUID, TEXT, TIMESTAMPTZ) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.track_developer_api_usage(
  p_api_key_id UUID,
  p_key_hash TEXT,
  p_month_start TIMESTAMPTZ,
  p_month_end TIMESTAMPTZ,
  p_minute_start TIMESTAMPTZ,
  p_minute_end TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id UUID;
  v_plan_id UUID;
  v_monthly_limit NUMERIC;
  v_minute_limit NUMERIC;
  v_monthly_used NUMERIC;
  v_minute_used NUMERIC;
BEGIN
  SELECT k.organization_id, bs.plan_id INTO v_org_id, v_plan_id
  FROM public.developer_api_keys k
  JOIN public.billing_subscriptions bs ON bs.organization_id = k.organization_id
  JOIN public.plan_entitlements developer_access
    ON developer_access.plan_id = bs.plan_id
   AND developer_access.key = 'developer_access.enabled'
   AND developer_access.value = 'true'::jsonb
  JOIN public.plan_entitlements public_api
    ON public_api.plan_id = bs.plan_id
   AND public_api.key = 'public_api.enabled'
   AND public_api.value = 'true'::jsonb
  WHERE k.id = p_api_key_id
    AND k.key_hash = p_key_hash
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now())
    AND public.is_organization_writable(k.organization_id)
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'invalid_api_key' USING ERRCODE = '42501';
  END IF;

  UPDATE public.developer_api_keys
  SET last_used_at = now(), updated_at = now()
  WHERE id = p_api_key_id;

  SELECT pl.value INTO v_monthly_limit
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = 'api_requests.monthly'
    AND pl.period = 'monthly'
  LIMIT 1;

  SELECT pl.value INTO v_minute_limit
  FROM public.plan_limits pl
  WHERE pl.plan_id = v_plan_id
    AND pl.key = 'api_requests.minute'
    AND pl.period = 'minute'
  LIMIT 1;

  INSERT INTO public.organization_usage_counters (
    organization_id, key, value, period_start, period_end, updated_at
  ) VALUES (
    v_org_id, 'api_requests.monthly', 0, p_month_start, p_month_end, now()
  )
  ON CONFLICT (organization_id, key, period_start) DO NOTHING;

  INSERT INTO public.organization_usage_counters (
    organization_id, key, value, period_start, period_end, updated_at
  ) VALUES (
    v_org_id, 'api_requests.minute', 0, p_minute_start, p_minute_end, now()
  )
  ON CONFLICT (organization_id, key, period_start) DO NOTHING;

  SELECT c.value INTO v_monthly_used
  FROM public.organization_usage_counters c
  WHERE c.organization_id = v_org_id
    AND c.key = 'api_requests.monthly'
    AND c.period_start = p_month_start
  FOR UPDATE;

  SELECT c.value INTO v_minute_used
  FROM public.organization_usage_counters c
  WHERE c.organization_id = v_org_id
    AND c.key = 'api_requests.minute'
    AND c.period_start = p_minute_start
  FOR UPDATE;

  IF v_monthly_limit IS NOT NULL AND COALESCE(v_monthly_used, 0) + 1 > v_monthly_limit THEN
    RAISE EXCEPTION 'api_rate_limited'
      USING ERRCODE = 'P0001', DETAIL = 'Monthly API request limit reached.';
  END IF;

  IF v_minute_limit IS NOT NULL AND COALESCE(v_minute_used, 0) + 1 > v_minute_limit THEN
    RAISE EXCEPTION 'api_rate_limited'
      USING ERRCODE = 'P0001', DETAIL = 'Minute API request limit reached.';
  END IF;

  UPDATE public.organization_usage_counters
  SET value = value + 1,
      period_end = p_month_end,
      updated_at = now()
  WHERE organization_id = v_org_id
    AND key = 'api_requests.monthly'
    AND period_start = p_month_start;

  UPDATE public.organization_usage_counters
  SET value = value + 1,
      period_end = p_minute_end,
      updated_at = now()
  WHERE organization_id = v_org_id
    AND key = 'api_requests.minute'
    AND period_start = p_minute_start;
END;
$$;

REVOKE ALL ON FUNCTION public.track_developer_api_usage(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_developer_api_usage(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;
