-- =============================================================================
-- Migration 096: Phase D Commercial SaaS Readiness
--
-- Adds the commercial catalog keys used by the app layer and teaches the
-- trusted webhook RPC to sync provider period/trial/cancel fields. Existing
-- billing_subscriptions + plans remain the source of truth.
-- =============================================================================

BEGIN;

WITH entitlement_seed(plan_code, key, value) AS (
  VALUES
    ('trial', 'documents.upload', 'true'::jsonb),
    ('trial', 'documents.process', 'true'::jsonb),
    ('trial', 'ai.suggestions.generate', 'true'::jsonb),
    ('trial', 'team.members.invite', 'true'::jsonb),
    ('trial', 'storage.files.upload', 'true'::jsonb),
    ('trial', 'automations.run', 'true'::jsonb),
    ('start', 'documents.upload', 'true'::jsonb),
    ('start', 'documents.process', 'true'::jsonb),
    ('start', 'ai.suggestions.generate', 'true'::jsonb),
    ('start', 'team.members.invite', 'true'::jsonb),
    ('start', 'storage.files.upload', 'true'::jsonb),
    ('start', 'automations.run', 'true'::jsonb),
    ('pro', 'documents.upload', 'true'::jsonb),
    ('pro', 'documents.process', 'true'::jsonb),
    ('pro', 'ai.suggestions.generate', 'true'::jsonb),
    ('pro', 'team.members.invite', 'true'::jsonb),
    ('pro', 'storage.files.upload', 'true'::jsonb),
    ('pro', 'automations.run', 'true'::jsonb),
    ('business', 'documents.upload', 'true'::jsonb),
    ('business', 'documents.process', 'true'::jsonb),
    ('business', 'ai.suggestions.generate', 'true'::jsonb),
    ('business', 'team.members.invite', 'true'::jsonb),
    ('business', 'storage.files.upload', 'true'::jsonb),
    ('business', 'automations.run', 'true'::jsonb)
)
INSERT INTO public.plan_entitlements(plan_id, key, value)
SELECT p.id, s.key, s.value
FROM entitlement_seed s
JOIN public.plans p ON p.code = s.plan_code
ON CONFLICT (plan_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

WITH limit_seed(plan_code, key, value, period) AS (
  VALUES
    ('trial', 'documents_processed.monthly', 25::numeric, 'monthly'),
    ('trial', 'ai_suggestions.monthly', 20::numeric, 'monthly'),
    ('trial', 'automation_runs.monthly', 50::numeric, 'monthly'),
    ('start', 'documents_processed.monthly', 100::numeric, 'monthly'),
    ('start', 'ai_suggestions.monthly', 50::numeric, 'monthly'),
    ('start', 'automation_runs.monthly', 250::numeric, 'monthly'),
    ('pro', 'documents_processed.monthly', 1000::numeric, 'monthly'),
    ('pro', 'ai_suggestions.monthly', 500::numeric, 'monthly'),
    ('pro', 'automation_runs.monthly', 2500::numeric, 'monthly'),
    ('business', 'documents_processed.monthly', NULL::numeric, 'monthly'),
    ('business', 'ai_suggestions.monthly', NULL::numeric, 'monthly'),
    ('business', 'automation_runs.monthly', NULL::numeric, 'monthly')
)
INSERT INTO public.plan_limits(plan_id, key, value, period)
SELECT p.id, s.key, s.value, s.period
FROM limit_seed s
JOIN public.plans p ON p.code = s.plan_code
ON CONFLICT (plan_id, key, period) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.automation_audit_logs
    WHERE trigger_event_id IS NOT NULL
    GROUP BY trigger_event_id, automation_name
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS automation_audit_logs_trigger_name_uidx
      ON public.automation_audit_logs(trigger_event_id, automation_name)
      WHERE trigger_event_id IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_billing_provider_event(
  p_provider TEXT,
  p_provider_event_id TEXT,
  p_event_type TEXT,
  p_event_created_at TIMESTAMPTZ,
  p_provider_customer_id TEXT,
  p_provider_subscription_id TEXT,
  p_organization_id UUID,
  p_plan_slug TEXT,
  p_billing_cycle TEXT,
  p_internal_status TEXT,
  p_payload JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_event_id UUID;
  v_org_id UUID;
  v_plan_id UUID;
  v_subscription_id UUID;
  v_current_plan_slug TEXT;
  v_previous_event_at TIMESTAMPTZ;
  v_status TEXT;
  v_payment_state TEXT;
  v_metadata JSONB;
  v_payload JSONB;
  v_now TIMESTAMPTZ := now();
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_trial_start TIMESTAMPTZ;
  v_trial_end TIMESTAMPTZ;
  v_cancel_at_period_end BOOLEAN;
  v_commercial_event TEXT;
BEGIN
  IF p_provider NOT IN ('stripe', 'paddle', 'lemonsqueezy') THEN
    RETURN jsonb_build_object('ok', false, 'ignored_reason', 'invalid_provider');
  END IF;

  IF p_internal_status NOT IN (
    'trialing', 'trial_expired', 'active', 'past_due', 'grace',
    'unpaid', 'canceled', 'suspended'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'ignored_reason', 'invalid_status');
  END IF;

  v_payload := COALESCE(p_payload, '{}'::jsonb);
  IF v_payload::text LIKE '%@%' THEN
    v_payload := jsonb_build_object(
      'source', 'billing_provider_webhook',
      'redacted', true,
      'redaction_reason', 'raw_email_detected'
    );
  END IF;

  v_period_start := NULLIF(v_payload ->> 'current_period_start', '')::timestamptz;
  v_period_end := NULLIF(v_payload ->> 'current_period_end', '')::timestamptz;
  v_trial_start := NULLIF(v_payload ->> 'trial_start', '')::timestamptz;
  v_trial_end := NULLIF(v_payload ->> 'trial_end', '')::timestamptz;
  v_cancel_at_period_end := CASE
    WHEN v_payload ? 'cancel_at_period_end' AND jsonb_typeof(v_payload -> 'cancel_at_period_end') = 'boolean'
      THEN (v_payload ->> 'cancel_at_period_end')::boolean
    ELSE NULL
  END;

  INSERT INTO public.billing_provider_events (
    provider, provider_event_id, event_type, event_created_at,
    organization_id, provider_customer_id, provider_subscription_id,
    internal_status, plan_slug, billing_cycle, payload
  )
  VALUES (
    p_provider, p_provider_event_id, p_event_type, p_event_created_at,
    p_organization_id, p_provider_customer_id, p_provider_subscription_id,
    p_internal_status, p_plan_slug, p_billing_cycle, v_payload
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.billing_provider_mappings
  WHERE provider = p_provider
    AND is_active
    AND (
      (p_provider_subscription_id IS NOT NULL AND provider_subscription_id = p_provider_subscription_id)
      OR (p_provider_customer_id IS NOT NULL AND provider_customer_id = p_provider_customer_id)
    )
  ORDER BY provider_subscription_id IS NOT NULL DESC, created_at DESC
  LIMIT 1;

  IF v_org_id IS NULL AND p_organization_id IS NOT NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE id = p_organization_id;
  END IF;

  IF v_org_id IS NULL THEN
    UPDATE public.billing_provider_events
    SET processed_at = v_now, ignored_reason = 'mapping_not_found'
    WHERE id = v_event_id;
    RETURN jsonb_build_object('ok', true, 'ignored_reason', 'mapping_not_found');
  END IF;

  IF p_plan_slug IS NOT NULL THEN
    SELECT id INTO v_plan_id
    FROM public.plans
    WHERE slug = p_plan_slug
      AND slug <> 'trial'
      AND is_active
    LIMIT 1;

    IF v_plan_id IS NULL THEN
      UPDATE public.billing_provider_events
      SET organization_id = v_org_id, processed_at = v_now, ignored_reason = 'plan_not_found'
      WHERE id = v_event_id;
      RETURN jsonb_build_object('ok', true, 'organization_id', v_org_id, 'ignored_reason', 'plan_not_found');
    END IF;
  END IF;

  SELECT bs.id, p.slug, ((bs.metadata ->> 'last_provider_event_created_at')::timestamptz)
    INTO v_subscription_id, v_current_plan_slug, v_previous_event_at
  FROM public.billing_subscriptions bs
  LEFT JOIN public.plans p ON p.id = bs.plan_id
  WHERE bs.organization_id = v_org_id
  LIMIT 1;

  IF v_previous_event_at IS NOT NULL AND p_event_created_at < v_previous_event_at THEN
    UPDATE public.billing_provider_events
    SET organization_id = v_org_id, processed_at = v_now, ignored_reason = 'out_of_order'
    WHERE id = v_event_id;
    RETURN jsonb_build_object('ok', true, 'organization_id', v_org_id, 'ignored_reason', 'out_of_order');
  END IF;

  IF p_internal_status IN ('trialing', 'active', 'past_due', 'grace', 'unpaid')
     AND v_plan_id IS NULL
     AND (v_current_plan_slug IS NULL OR v_current_plan_slug = 'trial') THEN
    UPDATE public.billing_provider_events
    SET organization_id = v_org_id, processed_at = v_now, ignored_reason = 'paid_plan_required'
    WHERE id = v_event_id;
    RETURN jsonb_build_object('ok', true, 'organization_id', v_org_id, 'ignored_reason', 'paid_plan_required');
  END IF;

  v_status := CASE p_internal_status
    WHEN 'trialing' THEN 'trialing'
    WHEN 'trial_expired' THEN 'expired'
    WHEN 'active' THEN 'active'
    WHEN 'past_due' THEN 'past_due'
    WHEN 'grace' THEN 'past_due'
    WHEN 'unpaid' THEN 'past_due'
    WHEN 'canceled' THEN 'canceled'
    WHEN 'suspended' THEN 'paused'
    ELSE 'past_due'
  END;

  v_payment_state := CASE p_internal_status
    WHEN 'grace' THEN 'payment_grace'
    WHEN 'unpaid' THEN 'payment_unpaid'
    ELSE NULL
  END;

  v_metadata :=
    jsonb_build_object(
      'billing_provider', p_provider,
      'last_provider_event_id', p_provider_event_id,
      'last_provider_event_type', p_event_type,
      'last_provider_event_created_at', p_event_created_at,
      'provider_managed', true
    );

  IF v_payment_state IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object('payment_state', v_payment_state);
  END IF;

  IF v_subscription_id IS NULL THEN
    IF v_plan_id IS NULL THEN
      UPDATE public.billing_provider_events
      SET organization_id = v_org_id, processed_at = v_now, ignored_reason = 'subscription_not_found'
      WHERE id = v_event_id;
      RETURN jsonb_build_object('ok', true, 'organization_id', v_org_id, 'ignored_reason', 'subscription_not_found');
    END IF;

    INSERT INTO public.billing_subscriptions (
      organization_id, plan_id, status, billing_cycle, current_period_start,
      current_period_end, trial_ends_at, canceled_at, cancel_at_period_end, external_id,
      billing_provider, provider_customer_id, provider_subscription_id,
      trial_start, trial_end, metadata
    )
    VALUES (
      v_org_id, v_plan_id, v_status, COALESCE(p_billing_cycle, 'monthly'),
      COALESCE(v_period_start, v_now), COALESCE(v_period_end, v_now + INTERVAL '1 month'),
      v_trial_end,
      CASE WHEN v_status = 'canceled' THEN v_now ELSE NULL END,
      COALESCE(v_cancel_at_period_end, false),
      p_provider_subscription_id,
      p_provider, p_provider_customer_id, p_provider_subscription_id,
      v_trial_start, v_trial_end, v_metadata
    )
    RETURNING id INTO v_subscription_id;
  ELSE
    UPDATE public.billing_subscriptions
    SET plan_id = COALESCE(v_plan_id, plan_id),
        status = v_status,
        billing_cycle = COALESCE(p_billing_cycle, billing_cycle),
        current_period_start = COALESCE(v_period_start, current_period_start),
        current_period_end = COALESCE(v_period_end, current_period_end),
        trial_ends_at = COALESCE(v_trial_end, trial_ends_at),
        trial_start = COALESCE(v_trial_start, trial_start),
        trial_end = COALESCE(v_trial_end, trial_end),
        canceled_at = CASE WHEN v_status = 'canceled' THEN COALESCE(canceled_at, v_now) ELSE NULL END,
        cancel_at_period_end = COALESCE(
          v_cancel_at_period_end,
          CASE WHEN v_status = 'canceled' THEN cancel_at_period_end ELSE false END
        ),
        external_id = COALESCE(p_provider_subscription_id, external_id),
        billing_provider = p_provider,
        provider_customer_id = COALESCE(p_provider_customer_id, provider_customer_id),
        provider_subscription_id = COALESCE(p_provider_subscription_id, provider_subscription_id),
        metadata = (
          (COALESCE(metadata, '{}'::jsonb) - 'trial_denied' - 'payment_state')
          || v_metadata
        ),
        updated_at = v_now
    WHERE id = v_subscription_id;
  END IF;

  IF p_provider_customer_id IS NOT NULL OR p_provider_subscription_id IS NOT NULL THEN
    IF p_provider_subscription_id IS NOT NULL THEN
      INSERT INTO public.billing_provider_mappings (
        organization_id, provider, provider_customer_id, provider_subscription_id, is_active
      )
      VALUES (v_org_id, p_provider, p_provider_customer_id, p_provider_subscription_id, true)
      ON CONFLICT (provider, provider_subscription_id)
        WHERE provider_subscription_id IS NOT NULL
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, billing_provider_mappings.provider_customer_id),
        is_active = true,
        updated_at = v_now;
    ELSE
      INSERT INTO public.billing_provider_mappings (
        organization_id, provider, provider_customer_id, provider_subscription_id, is_active
      )
      VALUES (v_org_id, p_provider, p_provider_customer_id, NULL, true)
      ON CONFLICT (provider, provider_customer_id)
        WHERE provider_customer_id IS NOT NULL
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        is_active = true,
        updated_at = v_now;
    END IF;
  END IF;

  UPDATE public.billing_provider_events
  SET organization_id = v_org_id, processed_at = v_now
  WHERE id = v_event_id;

  v_commercial_event := CASE
    WHEN p_event_type = 'checkout.session.completed' THEN 'checkout_completed'
    WHEN p_event_type = 'invoice.payment_failed' THEN 'checkout_failed'
    WHEN p_internal_status = 'canceled' THEN 'subscription_cancelled'
    ELSE 'subscription_updated'
  END;

  INSERT INTO public.domain_events (
    organization_id, workspace_id, event_name, aggregate_type, aggregate_id,
    payload, created_by, version
  )
  VALUES (
    v_org_id, NULL, v_commercial_event, 'organization', v_org_id,
    jsonb_build_object(
      'provider', p_provider,
      'provider_event_id', p_provider_event_id,
      'event_type', p_event_type,
      'status', p_internal_status,
      'plan_slug', p_plan_slug,
      'billing_cycle', p_billing_cycle,
      'current_period_start', v_period_start,
      'current_period_end', v_period_end,
      'trial_start', v_trial_start,
      'trial_end', v_trial_end,
      'cancel_at_period_end', v_cancel_at_period_end
    ),
    NULL,
    1
  );

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'organization_id', v_org_id,
    'subscription_id', v_subscription_id,
    'status', p_internal_status
  );
END;
$$;

COMMENT ON FUNCTION public.apply_billing_provider_event IS
  'Webhook-only billing state transition. Verifies idempotency, maps provider IDs, ignores older events, syncs provider periods, and updates paid state transactionally.';

COMMIT;
