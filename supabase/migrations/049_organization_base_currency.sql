-- ============================================================
-- Migration 049: organizations.base_currency + currency at onboarding
-- ============================================================
-- Зачем:
--   Базовая валюта организации — основа будущего FX-слоя (exchange_rates +
--   fn_get_exchange_rate). Определяется при онбординге по стране регистрации
--   (гео → валюта), пользователь подтверждает/меняет значение.
--
-- Состав:
--   1. organizations.base_currency (NOT NULL, DEFAULT 'EUR', CHECK allowlist)
--   2. create_organization() переопределяется с 3-м параметром p_base_currency
--      (сохраняя trial-провижининг из миграции 024)
--   3. Гранты EXECUTE на новую сигнатуру (TEXT, TEXT, TEXT)
--
-- Идемпотентность: IF NOT EXISTS / DROP ... IF EXISTS.
-- Список валют в CHECK обязан совпадать с shared/config/currencies.ts.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Колонка base_currency
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'EUR';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_base_currency_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_base_currency_check CHECK (
    base_currency IN (
      'EUR','USD','GBP','MDL','RON','UAH','RUB','PLN','CZK','HUF',
      'BGN','SEK','DKK','NOK','CHF','TRY','CAD','AUD','NZD','JPY',
      'CNY','INR','BRL','MXN','ZAR','AED','ILS','SGD','HKD','KRW',
      'GEL','AMD','AZN','KZT','RSD'
    )
  );

COMMENT ON COLUMN public.organizations.base_currency IS
  'ISO 4217 base currency for the org. Set at onboarding (geo-detected, '
  'user-confirmed). Effectively immutable: changing it requires re-converting '
  'history. Consumed by the FX layer (fn_get_exchange_rate).';

-- ---------------------------------------------------------------------------
-- 2. create_organization() — добавляем p_base_currency
--    Старую 2-арговую сигнатуру дропаем: иначе вызов create_organization(a,b)
--    станет неоднозначным между (TEXT,TEXT) и (TEXT,TEXT,TEXT DEFAULT).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_organization(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_organization(
  p_name          TEXT,
  p_slug          TEXT,
  p_base_currency TEXT DEFAULT 'EUR'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_id    UUID;
  v_user_id   UUID;
  v_currency  TEXT;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  -- Нормализуем валюту: пусто → дефолт, верхний регистр, формат ISO.
  -- Принадлежность allowlist'у дополнительно гарантирует CHECK-констрейнт.
  v_currency := upper(coalesce(nullif(trim(p_base_currency), ''), 'EUR'));
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency';
  END IF;

  -- 1. Организация (plan = legacy-зеркало, источник правды — подписка)
  INSERT INTO public.organizations (name, slug, plan, base_currency)
  VALUES (trim(p_name), lower(trim(p_slug)), 'trial', v_currency)
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

COMMENT ON FUNCTION public.create_organization(TEXT, TEXT, TEXT) IS
  'Atomically creates org + owner membership + default workspace + 14-day trial '
  'subscription, with org base_currency. Called from onboarding Server Action. '
  'SECURITY DEFINER for RLS bootstrap.';

-- ---------------------------------------------------------------------------
-- 3. Гранты на новую сигнатуру (зеркалит 035/037 для authenticated-only)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT, TEXT) TO authenticated;
