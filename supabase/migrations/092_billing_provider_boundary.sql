-- =============================================================================
-- Migration 092: Billing provider boundary
--
-- Paid plan activation must come from a trusted provider webhook, not from a
-- dashboard action. This migration adds provider mapping + event-dedupe tables
-- and one SECURITY DEFINER RPC used only by the webhook route.
-- =============================================================================

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS billing_provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_status_check;

ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_status_check
  CHECK (status IN ('trialing', 'expired', 'active', 'past_due', 'canceled', 'paused'));

CREATE TABLE IF NOT EXISTS public.billing_provider_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'paddle', 'lemonsqueezy')),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (provider_customer_id IS NOT NULL OR provider_subscription_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_provider_mappings_customer_uidx
  ON public.billing_provider_mappings(provider, provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_provider_mappings_subscription_uidx
  ON public.billing_provider_mappings(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_provider_mappings_org_idx
  ON public.billing_provider_mappings(organization_id, provider, is_active);

DROP TRIGGER IF EXISTS handle_updated_at_billing_provider_mappings ON public.billing_provider_mappings;
CREATE TRIGGER handle_updated_at_billing_provider_mappings
  BEFORE UPDATE ON public.billing_provider_mappings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.billing_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('stripe', 'paddle', 'lemonsqueezy')),
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_created_at TIMESTAMPTZ NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  internal_status TEXT CHECK (
    internal_status IS NULL OR internal_status IN (
      'trialing', 'trial_expired', 'active', 'past_due', 'grace',
      'unpaid', 'canceled', 'suspended'
    )
  ),
  plan_slug TEXT,
  billing_cycle TEXT CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'yearly')),
  processed_at TIMESTAMPTZ,
  ignored_reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS billing_provider_events_org_created_idx
  ON public.billing_provider_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_provider_events_subscription_idx
  ON public.billing_provider_events(provider, provider_subscription_id);

ALTER TABLE public.billing_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_provider_mappings_select_admin" ON public.billing_provider_mappings;
CREATE POLICY "billing_provider_mappings_select_admin"
  ON public.billing_provider_mappings FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "billing_provider_events_select_admin" ON public.billing_provider_events;
CREATE POLICY "billing_provider_events_select_admin"
  ON public.billing_provider_events FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_admin(organization_id));

REVOKE ALL ON public.billing_provider_mappings FROM anon, authenticated;
REVOKE ALL ON public.billing_provider_events FROM anon, authenticated;
GRANT SELECT ON public.billing_provider_mappings TO authenticated;
GRANT SELECT ON public.billing_provider_events TO authenticated;

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
      current_period_end, canceled_at, cancel_at_period_end, external_id,
      billing_provider, provider_customer_id, provider_subscription_id, metadata
    )
    VALUES (
      v_org_id, v_plan_id, v_status, COALESCE(p_billing_cycle, 'monthly'),
      v_now, v_now + INTERVAL '1 month',
      CASE WHEN v_status = 'canceled' THEN v_now ELSE NULL END,
      false,
      p_provider_subscription_id,
      p_provider, p_provider_customer_id, p_provider_subscription_id, v_metadata
    )
    RETURNING id INTO v_subscription_id;
  ELSE
    UPDATE public.billing_subscriptions
    SET plan_id = COALESCE(v_plan_id, plan_id),
        status = v_status,
        billing_cycle = COALESCE(p_billing_cycle, billing_cycle),
        canceled_at = CASE WHEN v_status = 'canceled' THEN COALESCE(canceled_at, v_now) ELSE NULL END,
        cancel_at_period_end = CASE WHEN v_status = 'canceled' THEN cancel_at_period_end ELSE false END,
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
  'Webhook-only billing state transition. Verifies idempotency, maps provider IDs, ignores older events, and updates paid state transactionally.';

REVOKE ALL ON FUNCTION public.apply_billing_provider_event(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

-- Service role calls this RPC from the isolated webhook route. Normal user
-- application logic must never use service role to mutate billing state.
GRANT EXECUTE ON FUNCTION public.apply_billing_provider_event(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB
) TO service_role;
