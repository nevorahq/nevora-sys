-- =============================================================================
-- Migration 033: Start plan enforcement and AI request ledger
--
-- Server Actions provide friendly errors, but plan limits must also hold for
-- direct PostgREST access. These triggers are the final authority for all
-- Start resources. They deliberately count live rows instead of maintaining
-- a second, eventually-consistent counter table.
-- =============================================================================

-- Start has one included seat and charges for seats two and three. Keeping
-- these values with the plan makes the price calculation auditable and avoids
-- hard-coding pricing in a React component.
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS included_members INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS extra_member_price NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE public.plans
SET included_members = 1,
    extra_member_price = 5,
    features = '{
      "tasks.enabled": true,
      "crm.basic": true,
      "crm.advanced": false,
      "money.basic": true,
      "money.forecasting": false,
      "documents.basic": true,
      "documents.advanced": false,
      "subscriptions.enabled": true,
      "analytics.basic": true,
      "analytics.advanced": false,
      "ai.basic": true,
      "ai.advanced": false,
      "workspaces.multiple": false,
      "rbac.advanced": false,
      "audit_logs.visible": false,
      "automation.enabled": false
    }'::jsonb,
    updated_at = now()
WHERE slug = 'start';

-- A request ledger is the source of truth for the monthly AI quota. Counting
-- generated rows is incorrect: a summary upsert can overwrite an old row,
-- while one insight request can create several rows.
CREATE TABLE IF NOT EXISTS public.ai_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type     TEXT        NOT NULL CHECK (action_type IN ('summary', 'insights', 'recommendations')),
  status          TEXT        NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'completed', 'failed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS ai_requests_org_month_idx
  ON public.ai_requests (organization_id, created_at DESC);

ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_requests_org_select" ON public.ai_requests;
CREATE POLICY "ai_requests_org_select"
  ON public.ai_requests FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "ai_requests_org_insert" ON public.ai_requests;
CREATE POLICY "ai_requests_org_insert"
  ON public.ai_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_write_data(organization_id));

DROP POLICY IF EXISTS "ai_requests_org_update" ON public.ai_requests;
CREATE POLICY "ai_requests_org_update"
  ON public.ai_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.can_write_data(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.can_write_data(organization_id));

-- A cancelled subscription remains usable through the paid period. Expired
-- trials, paused subscriptions and elapsed cancelled periods are read-only.
CREATE OR REPLACE FUNCTION public.is_organization_writable(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN p.slug = 'trial' THEN
        bs.status = 'trialing'
        AND bs.trial_ends_at IS NOT NULL
        AND bs.trial_ends_at > now()
      WHEN bs.status = 'canceled' THEN bs.current_period_end > now()
      ELSE bs.status NOT IN ('paused', 'expired')
    END
    FROM public.billing_subscriptions bs
    JOIN public.plans p ON p.id = bs.plan_id
    WHERE bs.organization_id = p_organization_id
    LIMIT 1
  ), TRUE);
$$;

-- Returns the limit for an organization. A missing legacy subscription remains
-- unrestricted so the migration cannot lock existing customer data.
CREATE OR REPLACE FUNCTION public.organization_plan_limit(
  p_organization_id UUID,
  p_metric TEXT
)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_limit INT;
BEGIN
  SELECT CASE p_metric
    WHEN 'members' THEN p.max_members
    WHEN 'workspaces' THEN p.max_workspaces
    WHEN 'tasks' THEN p.max_tasks
    WHEN 'deals' THEN p.max_deals
    WHEN 'clients' THEN p.max_clients
    WHEN 'documents' THEN p.max_documents
    WHEN 'subscriptions' THEN p.max_subscriptions
    WHEN 'money_transactions' THEN p.max_money_transactions
    WHEN 'ai_calls' THEN p.max_ai_calls_mo
    WHEN 'storage_mb' THEN p.max_storage_mb
  END INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plans p ON p.id = bs.plan_id
  WHERE bs.organization_id = p_organization_id
  LIMIT 1;

  RETURN v_limit;
END;
$$;

-- The generic insert trigger makes the database, not the browser, enforce
-- Start limits. Soft-deleted records do not consume a count limit.
CREATE OR REPLACE FUNCTION public.enforce_plan_insert_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_metric TEXT := TG_ARGV[0];
  v_org UUID := NEW.organization_id;
  v_limit INT;
  v_used NUMERIC := 0;
BEGIN
  IF NOT public.is_organization_writable(v_org) THEN
    RAISE EXCEPTION 'subscription_not_writable'
      USING ERRCODE = '42501', DETAIL = 'The organization subscription does not allow mutations.';
  END IF;

  v_limit := public.organization_plan_limit(v_org, v_metric);
  IF v_limit IS NULL OR v_limit = -1 THEN RETURN NEW; END IF;

  CASE v_metric
    WHEN 'members' THEN
      SELECT count(*) INTO v_used FROM public.memberships
      WHERE organization_id = v_org AND status IN ('active', 'invited');
    WHEN 'workspaces' THEN
      SELECT count(*) INTO v_used FROM public.workspaces WHERE organization_id = v_org;
    WHEN 'tasks' THEN
      SELECT count(*) INTO v_used FROM public.todos
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'clients' THEN
      SELECT count(*) INTO v_used FROM public.crm_clients
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'deals' THEN
      SELECT count(*) INTO v_used FROM public.crm_deals
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'documents' THEN
      SELECT count(*) INTO v_used FROM public.documents
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'subscriptions' THEN
      SELECT count(*) INTO v_used FROM public.subscriptions WHERE organization_id = v_org;
    WHEN 'money_transactions' THEN
      SELECT count(*) INTO v_used FROM public.money_transactions
      WHERE organization_id = v_org AND deleted_at IS NULL;
    WHEN 'ai_calls' THEN
      SELECT count(*) INTO v_used FROM public.ai_requests
      WHERE organization_id = v_org AND created_at >= date_trunc('month', now());
    WHEN 'storage_mb' THEN
      SELECT COALESCE(sum(file_size), 0) / 1048576.0 INTO v_used
      FROM public.document_attachments WHERE organization_id = v_org;
      v_used := v_used + COALESCE(NEW.file_size, 0) / 1048576.0;
      IF v_used <= v_limit THEN RETURN NEW; END IF;
  END CASE;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'plan_limit_reached: %', v_metric
      USING ERRCODE = 'P0001', DETAIL = format('%s limit is %s for this organization.', v_metric, v_limit);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS start_limit_workspaces ON public.workspaces;
CREATE TRIGGER start_limit_workspaces BEFORE INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('workspaces');
DROP TRIGGER IF EXISTS start_limit_tasks ON public.todos;
CREATE TRIGGER start_limit_tasks BEFORE INSERT ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('tasks');
DROP TRIGGER IF EXISTS start_limit_clients ON public.crm_clients;
CREATE TRIGGER start_limit_clients BEFORE INSERT ON public.crm_clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('clients');
DROP TRIGGER IF EXISTS start_limit_deals ON public.crm_deals;
CREATE TRIGGER start_limit_deals BEFORE INSERT ON public.crm_deals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('deals');
DROP TRIGGER IF EXISTS start_limit_documents ON public.documents;
CREATE TRIGGER start_limit_documents BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('documents');
DROP TRIGGER IF EXISTS start_limit_subscriptions ON public.subscriptions;
CREATE TRIGGER start_limit_subscriptions BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('subscriptions');
DROP TRIGGER IF EXISTS start_limit_money_transactions ON public.money_transactions;
CREATE TRIGGER start_limit_money_transactions BEFORE INSERT ON public.money_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('money_transactions');
DROP TRIGGER IF EXISTS start_limit_attachments ON public.document_attachments;
CREATE TRIGGER start_limit_attachments BEFORE INSERT ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('storage_mb');
DROP TRIGGER IF EXISTS start_limit_ai_requests ON public.ai_requests;
CREATE TRIGGER start_limit_ai_requests BEFORE INSERT ON public.ai_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_insert_limit('ai_calls');

-- Membership invitation/acceptance is implemented through SECURITY DEFINER
-- RPCs and already checks the plan before insert (025/027). Do not attach the
-- generic trigger there: the owner bootstrap membership intentionally happens
-- before the subscription is created.
