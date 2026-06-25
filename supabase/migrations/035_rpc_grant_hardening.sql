-- ============================================================
-- Migration 035: SECURITY DEFINER RPC grant hardening (P0)
-- ============================================================
-- Контекст аудита:
--   В Postgres EXECUTE на новую функцию по умолчанию выдаётся роли
--   PUBLIC. Это значит, что КАЖДАЯ SECURITY DEFINER функция была
--   вызываема через anon/authenticated, даже если она задумана как
--   internal-only provisioning helper. Такие функции выполняются с
--   правами владельца и обходят RLS — это прямой канал привилегий.
--
-- Модель grants после этой миграции:
--
--   internal-only (вызываются ТОЛЬКО из других SECURITY DEFINER
--   функций через PERFORM, под ролью владельца — не клиентом):
--     • public.init_trial_subscription(UUID)
--     • public.init_free_subscription(UUID)
--   → EXECUTE отозван у PUBLIC / anon / authenticated.
--
--   authenticated-only (вызываются из server actions/pages под
--   сессией пользователя; внутри валидируют auth.uid()):
--     • public.create_organization(TEXT, TEXT)
--     • public.create_default_crm_pipeline(UUID)
--   → EXECUTE только у authenticated.
--
--   public (вызываются из публичного booking API под anon):
--     • public.create_booking_request_public(...)
--     • public.check_client_booking_conflict_public(...)
--   → EXECUTE у anon + authenticated; всё остальное отозвано.
--
-- Эта миграция НЕ трогает RLS-helper функции из 002 (is_org_member,
-- is_org_admin, can_*), т.к. они вызываются внутри RLS USING/CHECK в
-- контексте вызывающей роли и должны оставаться доступными.
-- ============================================================


-- ------------------------------------------------------------
-- 1. create_default_crm_pipeline — добавляем guard вызывающего.
--    Функция принимает p_org_id напрямую и как SECURITY DEFINER
--    обходит RLS. Без проверки членства любой authenticated мог бы
--    засеять pipeline в ЧУЖОЙ организации. Закрываем проверкой
--    активного членства текущего пользователя в p_org_id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_default_crm_pipeline(p_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_pipeline_id UUID;
BEGIN
  -- Guard: вызывающий должен быть активным членом этой организации.
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Уже есть default pipeline?
  SELECT id INTO v_pipeline_id
  FROM public.crm_pipelines
  WHERE organization_id = p_org_id AND is_default = true
  LIMIT 1;

  IF v_pipeline_id IS NOT NULL THEN
    RETURN v_pipeline_id;
  END IF;

  INSERT INTO public.crm_pipelines (organization_id, name, is_default)
  VALUES (p_org_id, 'Sales Pipeline', true)
  RETURNING id INTO v_pipeline_id;

  INSERT INTO public.crm_pipeline_stages
    (pipeline_id, organization_id, name, position, probability, color, stage_type)
  VALUES
    (v_pipeline_id, p_org_id, 'New Lead',      0,  10, '#94a3b8', 'open'),
    (v_pipeline_id, p_org_id, 'Qualified',     1,  25, '#60a5fa', 'open'),
    (v_pipeline_id, p_org_id, 'Proposal Sent', 2,  50, '#a78bfa', 'open'),
    (v_pipeline_id, p_org_id, 'Negotiation',   3,  75, '#f59e0b', 'open'),
    (v_pipeline_id, p_org_id, 'Won',            4, 100, '#22c55e', 'won'),
    (v_pipeline_id, p_org_id, 'Lost',           5,   0, '#ef4444', 'lost');

  RETURN v_pipeline_id;
END;
$$;

COMMENT ON FUNCTION public.create_default_crm_pipeline(UUID) IS
  'Idempotent seed of default CRM pipeline + stages. SECURITY DEFINER; '
  'guarded by is_org_member(p_org_id) so a user can only seed their own org. '
  'EXECUTE: authenticated only.';


-- ------------------------------------------------------------
-- 2. internal-only provisioning helpers → отозвать у клиентов.
--    Вызываются исключительно из create_organization (PERFORM),
--    под ролью владельца функции, поэтому клиентский EXECUTE не нужен.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.init_trial_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.init_trial_subscription(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.init_trial_subscription(UUID) FROM authenticated;

REVOKE ALL ON FUNCTION public.init_free_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.init_free_subscription(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.init_free_subscription(UUID) FROM authenticated;

COMMENT ON FUNCTION public.init_trial_subscription(UUID) IS
  'INTERNAL-ONLY. 14-day trialing subscription. Called only via PERFORM from '
  'create_organization under the definer role. EXECUTE revoked from all client roles.';

COMMENT ON FUNCTION public.init_free_subscription(UUID) IS
  'INTERNAL-ONLY legacy free-forever provisioning. Must NOT be reachable by clients: '
  'a direct call would let a user self-grant an unlimited plan and escape trial '
  'enforcement. EXECUTE revoked from all client roles.';


-- ------------------------------------------------------------
-- 3. create_organization → authenticated only.
--    Использует auth.uid() внутри; anon вызывать не должен.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.create_default_crm_pipeline(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_default_crm_pipeline(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_default_crm_pipeline(UUID) TO authenticated;


-- ------------------------------------------------------------
-- 4. Public booking RPCs → явный минимальный grant.
--    Это единственные SECURITY DEFINER функции, которые
--    намеренно достижимы анонимными посетителями booking-страниц.
--    Обе резолвят organization/host/service строго по slug и не
--    принимают internal IDs от клиента; search_path зафиксирован.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_booking_request_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_booking_request_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.check_client_booking_conflict_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_client_booking_conflict_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO anon, authenticated;

COMMENT ON FUNCTION public.create_booking_request_public(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  'PUBLIC booking entry point. SECURITY DEFINER; resolves org/host/service by slug '
  'only (no client-supplied internal IDs), fixed search_path. EXECUTE: anon + authenticated.';
