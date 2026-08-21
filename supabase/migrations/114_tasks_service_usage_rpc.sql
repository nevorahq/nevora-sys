-- Tasks standalone runtime: atomic plan usage operations for a verified service
-- actor. These functions are callable only by service_role and repeat active
-- membership validation inside PostgreSQL. Browser/authenticated callers keep
-- using reserve_organization_usage/release_organization_usage from migration 072.

CREATE OR REPLACE FUNCTION public.reserve_tasks_usage_for_service(
  p_organization_id UUID,
  p_actor_id UUID,
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_actor_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
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
    AND pl.key = 'tasks.count'
    AND pl.period = 'lifetime'
  LIMIT 1;

  INSERT INTO public.organization_usage_counters (
    organization_id, key, value, period_start, period_end, updated_at
  ) VALUES (
    p_organization_id, 'tasks.count', 0, '-infinity'::timestamptz, NULL, now()
  )
  ON CONFLICT (organization_id, key, period_start) DO NOTHING;

  SELECT value INTO v_value
  FROM public.organization_usage_counters
  WHERE organization_id = p_organization_id
    AND key = 'tasks.count'
    AND period_start = '-infinity'::timestamptz
  FOR UPDATE;

  IF v_limit IS NOT NULL AND v_value + p_increment > v_limit THEN
    RAISE EXCEPTION 'plan_limit_exceeded'
      USING ERRCODE = 'P0001',
            DETAIL = format('key=tasks.count current=%s limit=%s', v_value, v_limit);
  END IF;

  UPDATE public.organization_usage_counters
  SET value = value + p_increment,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND key = 'tasks.count'
    AND period_start = '-infinity'::timestamptz
  RETURNING value INTO v_value;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_tasks_usage_for_service(
  p_organization_id UUID,
  p_actor_id UUID,
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
  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = p_actor_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_decrement <= 0 THEN
    RAISE EXCEPTION 'usage_decrement_must_be_positive' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organization_usage_counters
  SET value = greatest(value - p_decrement, 0),
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND key = 'tasks.count'
    AND period_start = '-infinity'::timestamptz
  RETURNING value INTO v_value;

  RETURN COALESCE(v_value, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tasks_usage_for_service(UUID, UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_tasks_usage_for_service(UUID, UUID, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_tasks_usage_for_service(UUID, UUID, NUMERIC)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_tasks_usage_for_service(UUID, UUID, NUMERIC)
  TO service_role;

COMMENT ON FUNCTION public.reserve_tasks_usage_for_service(UUID, UUID, NUMERIC) IS
  'Service-role-only atomic tasks.count reservation for an active organization member.';
COMMENT ON FUNCTION public.release_tasks_usage_for_service(UUID, UUID, NUMERIC) IS
  'Service-role-only compensation for a failed standalone Tasks insert.';
