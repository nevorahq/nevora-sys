-- =============================================================================
-- Migration 072: Phase 6.2 atomic product usage reservations
-- =============================================================================

-- Bring lifetime product counters in line with the existing live rows before
-- reservations become authoritative. The sentinel matches migration 071.
WITH usage_values(organization_id, key, value) AS (
  SELECT o.id, 'tasks.count', count(t.id)::numeric
  FROM public.organizations o
  LEFT JOIN public.todos t ON t.organization_id = o.id AND t.deleted_at IS NULL
  GROUP BY o.id
  UNION ALL
  SELECT o.id, 'documents.count', count(d.id)::numeric
  FROM public.organizations o
  LEFT JOIN public.documents d ON d.organization_id = o.id AND d.deleted_at IS NULL
  GROUP BY o.id
  UNION ALL
  SELECT o.id, 'money_transactions.count', count(mt.id)::numeric
  FROM public.organizations o
  LEFT JOIN public.money_transactions mt ON mt.organization_id = o.id AND mt.deleted_at IS NULL
  GROUP BY o.id
  UNION ALL
  SELECT o.id, 'subscriptions.count', count(s.id)::numeric
  FROM public.organizations o
  LEFT JOIN public.subscriptions s ON s.organization_id = o.id
  GROUP BY o.id
  UNION ALL
  SELECT o.id, 'developer_api_keys.count', count(k.id)::numeric
  FROM public.organizations o
  LEFT JOIN public.developer_api_keys k ON k.organization_id = o.id AND k.revoked_at IS NULL
  GROUP BY o.id
  UNION ALL
  SELECT o.id, 'developer_webhooks.count', count(w.id)::numeric
  FROM public.organizations o
  LEFT JOIN public.developer_webhooks w ON w.organization_id = o.id AND w.is_active
  GROUP BY o.id
)
INSERT INTO public.organization_usage_counters (
  organization_id, key, value, period_start, period_end, updated_at
)
SELECT organization_id, key, value, '-infinity'::timestamptz, NULL, now()
FROM usage_values
ON CONFLICT (organization_id, key, period_start)
DO UPDATE SET value = EXCLUDED.value, period_end = NULL, updated_at = now();

CREATE OR REPLACE FUNCTION public.reserve_organization_usage(
  p_organization_id UUID,
  p_key TEXT,
  p_increment NUMERIC DEFAULT 1
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit NUMERIC;
  v_value NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_key NOT IN (
    'tasks.count',
    'documents.count',
    'money_transactions.count',
    'subscriptions.count',
    'developer_api_keys.count',
    'developer_webhooks.count'
  ) THEN
    RAISE EXCEPTION 'unsupported_usage_key' USING ERRCODE = '22023';
  END IF;

  IF p_increment <= 0 THEN
    RAISE EXCEPTION 'usage_increment_must_be_positive' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_organization_writable(p_organization_id) THEN
    RAISE EXCEPTION 'subscription_not_writable' USING ERRCODE = 'P0001';
  END IF;

  SELECT pl.value INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plan_limits pl ON pl.plan_id = bs.plan_id
  WHERE bs.organization_id = p_organization_id
    AND pl.key = p_key
    AND pl.period = 'lifetime'
  LIMIT 1;

  INSERT INTO public.organization_usage_counters (
    organization_id, key, value, period_start, period_end, updated_at
  ) VALUES (
    p_organization_id, p_key, 0, '-infinity'::timestamptz, NULL, now()
  )
  ON CONFLICT (organization_id, key, period_start) DO NOTHING;

  SELECT value INTO v_value
  FROM public.organization_usage_counters
  WHERE organization_id = p_organization_id
    AND key = p_key
    AND period_start = '-infinity'::timestamptz
  FOR UPDATE;

  -- NULL is intentionally unlimited. A missing normalized limit retains the
  -- Phase 6 compatibility behavior and is also treated as unlimited.
  IF v_limit IS NOT NULL AND v_value + p_increment > v_limit THEN
    RAISE EXCEPTION 'plan_limit_exceeded'
      USING ERRCODE = 'P0001',
            DETAIL = format('key=%s current=%s limit=%s', p_key, v_value, v_limit);
  END IF;

  UPDATE public.organization_usage_counters
  SET value = value + p_increment,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND key = p_key
    AND period_start = '-infinity'::timestamptz
  RETURNING value INTO v_value;

  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_organization_usage(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_organization_usage(UUID, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_organization_usage(
  p_organization_id UUID,
  p_key TEXT,
  p_decrement NUMERIC DEFAULT 1
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_value NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_decrement <= 0 THEN
    RAISE EXCEPTION 'usage_decrement_must_be_positive' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organization_usage_counters
  SET value = greatest(value - p_decrement, 0),
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND key = p_key
    AND period_start = '-infinity'::timestamptz
  RETURNING value INTO v_value;

  RETURN COALESCE(v_value, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.release_organization_usage(UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_organization_usage(UUID, TEXT, NUMERIC) TO authenticated;

-- Keep counters aligned when an already-counted product is removed. Failed
-- inserts never fire these triggers; those are compensated by the application.
CREATE OR REPLACE FUNCTION public.release_product_usage_on_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id UUID;
  v_key TEXT := TG_ARGV[0];
  v_should_release BOOLEAN := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org_id := OLD.organization_id;
    v_should_release := CASE v_key
      WHEN 'tasks.count' THEN OLD.deleted_at IS NULL
      WHEN 'documents.count' THEN OLD.deleted_at IS NULL
      WHEN 'money_transactions.count' THEN OLD.deleted_at IS NULL
      WHEN 'developer_api_keys.count' THEN OLD.revoked_at IS NULL
      WHEN 'developer_webhooks.count' THEN OLD.is_active
      WHEN 'subscriptions.count' THEN true
      ELSE false
    END;
  ELSE
    v_org_id := NEW.organization_id;
    v_should_release := CASE v_key
      WHEN 'tasks.count' THEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      WHEN 'documents.count' THEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      WHEN 'money_transactions.count' THEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      WHEN 'developer_api_keys.count' THEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
      WHEN 'developer_webhooks.count' THEN OLD.is_active AND NOT NEW.is_active
      ELSE false
    END;
  END IF;

  IF v_should_release THEN
    UPDATE public.organization_usage_counters
    SET value = greatest(value - 1, 0), updated_at = now()
    WHERE organization_id = v_org_id
      AND key = v_key
      AND period_start = '-infinity'::timestamptz;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.release_product_usage_on_removal() FROM PUBLIC;

DROP TRIGGER IF EXISTS release_task_usage_on_removal ON public.todos;
CREATE TRIGGER release_task_usage_on_removal
  AFTER DELETE OR UPDATE OF deleted_at ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.release_product_usage_on_removal('tasks.count');

DROP TRIGGER IF EXISTS release_document_usage_on_removal ON public.documents;
CREATE TRIGGER release_document_usage_on_removal
  AFTER DELETE OR UPDATE OF deleted_at ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.release_product_usage_on_removal('documents.count');

DROP TRIGGER IF EXISTS release_transaction_usage_on_removal ON public.money_transactions;
CREATE TRIGGER release_transaction_usage_on_removal
  AFTER DELETE OR UPDATE OF deleted_at ON public.money_transactions
  FOR EACH ROW EXECUTE FUNCTION public.release_product_usage_on_removal('money_transactions.count');

DROP TRIGGER IF EXISTS release_subscription_usage_on_removal ON public.subscriptions;
CREATE TRIGGER release_subscription_usage_on_removal
  AFTER DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.release_product_usage_on_removal('subscriptions.count');

DROP TRIGGER IF EXISTS release_api_key_usage_on_removal ON public.developer_api_keys;
CREATE TRIGGER release_api_key_usage_on_removal
  AFTER DELETE OR UPDATE OF revoked_at ON public.developer_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.release_product_usage_on_removal('developer_api_keys.count');

DROP TRIGGER IF EXISTS release_webhook_usage_on_removal ON public.developer_webhooks;
CREATE TRIGGER release_webhook_usage_on_removal
  AFTER DELETE OR UPDATE OF is_active ON public.developer_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.release_product_usage_on_removal('developer_webhooks.count');

-- Replace the legacy attachment trigger, which converted live byte totals to
-- MB, with a canonical byte-only guard backed by plan_limits.storage.bytes.
CREATE OR REPLACE FUNCTION public.enforce_storage_bytes_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_limit NUMERIC;
  v_used NUMERIC;
  v_incoming NUMERIC := COALESCE(NEW.file_size, NEW.size_bytes, 0);
BEGIN
  IF NOT public.is_organization_writable(NEW.organization_id) THEN
    RAISE EXCEPTION 'subscription_not_writable'
      USING ERRCODE = '42501', DETAIL = 'The organization subscription does not allow mutations.';
  END IF;

  SELECT pl.value INTO v_limit
  FROM public.billing_subscriptions bs
  JOIN public.plan_limits pl ON pl.plan_id = bs.plan_id
  WHERE bs.organization_id = NEW.organization_id
    AND pl.key = 'storage.bytes'
    AND pl.period = 'lifetime'
  LIMIT 1;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(sum(COALESCE(file_size, size_bytes, 0)), 0)
  INTO v_used
  FROM public.document_attachments
  WHERE organization_id = NEW.organization_id;

  IF v_used + v_incoming > v_limit THEN
    RAISE EXCEPTION 'plan_limit_exceeded'
      USING ERRCODE = 'P0001',
            DETAIL = format('key=storage.bytes current=%s incoming=%s limit=%s', v_used, v_incoming, v_limit);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_storage_bytes_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS start_limit_attachments ON public.document_attachments;
DROP TRIGGER IF EXISTS phase6_storage_bytes_limit ON public.document_attachments;
CREATE TRIGGER phase6_storage_bytes_limit
  BEFORE INSERT ON public.document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_storage_bytes_limit();
