-- ============================================================
-- Migration 050: FX layer — exchange_rates + fn_get_exchange_rate
-- ============================================================
-- Зачем:
--   Кросс-валютные итоги (баланс/доходы/расходы в base_currency организации)
--   требуют курсов. Конвертация считается в БД через fn_get_exchange_rate,
--   а не на JS.
--
-- Модель:
--   exchange_rates — СПРАВОЧНЫЕ (reference) данные, НЕ принадлежат организации.
--   Это рыночные курсы, общие для всех тенантов. Поэтому здесь СОЗНАТЕЛЬНОЕ
--   исключение из правила «фильтруй по organization_id»: таблица без
--   organization_id, читается всеми authenticated, пишется только сервисной
--   ролью (нет client-политик на запись).
--
--   Пивот EUR: храним «1 EUR = rate_per_eur <quote>». Кросс-курс считается
--   как rate(from→to) = eur_to(to) / eur_to(from). Так не нужно хранить все
--   пары — только курс каждой валюты к EUR.
--
-- Источник курсов:
--   Ниже — bootstrap-seed (source='seed') для работоспособности UI без
--   внешнего фетчера. Живое обновление (Edge Function от внешнего API,
--   source='api') — отдельный шаг, требует API-ключа и деплоя.
--
-- Идемпотентность: IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Таблица курсов (reference data, EUR-пивот)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_currency TEXT NOT NULL,
  -- Сколько единиц quote_currency в 1 EUR на дату as_of_date.
  rate_per_eur   NUMERIC(18, 8) NOT NULL CHECK (rate_per_eur > 0),
  as_of_date     DATE NOT NULL,
  source         TEXT NOT NULL DEFAULT 'seed',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rates_quote_date_unique UNIQUE (quote_currency, as_of_date)
);

-- Поиск «последний курс на дату <= X»: WHERE quote=? AND as_of_date<=? ORDER BY date DESC.
-- UNIQUE(quote_currency, as_of_date) уже даёт нужный b-tree по (quote, date).
CREATE INDEX IF NOT EXISTS idx_exchange_rates_quote_date
  ON public.exchange_rates (quote_currency, as_of_date DESC);

COMMENT ON TABLE public.exchange_rates IS
  'Reference FX rates (EUR pivot): 1 EUR = rate_per_eur of quote_currency. '
  'Global, not tenant-scoped. Read by all authenticated; written by service role only.';

-- ---------------------------------------------------------------------------
-- 2. RLS: read-only для клиентов
-- ---------------------------------------------------------------------------
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exchange_rates_select ON public.exchange_rates;
CREATE POLICY exchange_rates_select
  ON public.exchange_rates
  FOR SELECT
  TO authenticated
  USING (true);

-- Нет INSERT/UPDATE/DELETE-политик → клиенты писать не могут.
-- Пишет только service_role (Edge Function-фетчер) или миграции.
REVOKE ALL ON public.exchange_rates FROM PUBLIC, anon;
GRANT SELECT ON public.exchange_rates TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. fn_get_exchange_rate(from, to, on_date) → сколько `to` за 1 `from`
--    NULL, если нет курса (caller показывает разбивку по валютам).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_exchange_rate(
  p_from    TEXT,
  p_to      TEXT,
  p_on_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_from        TEXT := upper(trim(p_from));
  v_to          TEXT := upper(trim(p_to));
  v_eur_to_from NUMERIC;
  v_eur_to_to   NUMERIC;
BEGIN
  IF v_from = v_to THEN
    RETURN 1;
  END IF;

  -- 1 EUR = ? from (ближайшая дата <= p_on_date). EUR — пивот, курс = 1.
  v_eur_to_from := CASE WHEN v_from = 'EUR' THEN 1 ELSE (
    SELECT rate_per_eur
    FROM public.exchange_rates
    WHERE quote_currency = v_from AND as_of_date <= p_on_date
    ORDER BY as_of_date DESC
    LIMIT 1
  ) END;

  v_eur_to_to := CASE WHEN v_to = 'EUR' THEN 1 ELSE (
    SELECT rate_per_eur
    FROM public.exchange_rates
    WHERE quote_currency = v_to AND as_of_date <= p_on_date
    ORDER BY as_of_date DESC
    LIMIT 1
  ) END;

  IF v_eur_to_from IS NULL OR v_eur_to_to IS NULL THEN
    RETURN NULL;
  END IF;

  -- from → EUR → to
  RETURN v_eur_to_to / v_eur_to_from;
END;
$$;

COMMENT ON FUNCTION public.fn_get_exchange_rate(TEXT, TEXT, DATE) IS
  'Cross rate via EUR pivot: units of p_to per 1 p_from at nearest as_of_date '
  '<= p_on_date. Returns NULL when a rate is missing.';

REVOKE ALL ON FUNCTION public.fn_get_exchange_rate(TEXT, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_exchange_rate(TEXT, TEXT, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bootstrap-seed (source='seed', дата = день применения миграции)
--    ПЛЕЙСХОЛДЕРНЫЕ значения для работоспособности UI. Замени живыми курсами.
-- ---------------------------------------------------------------------------
INSERT INTO public.exchange_rates (quote_currency, rate_per_eur, as_of_date, source)
VALUES
  ('EUR', 1.00000000,  CURRENT_DATE, 'seed'),
  ('USD', 1.08000000,  CURRENT_DATE, 'seed'),
  ('GBP', 0.85000000,  CURRENT_DATE, 'seed'),
  ('MDL', 19.30000000, CURRENT_DATE, 'seed'),
  ('RON', 4.97000000,  CURRENT_DATE, 'seed'),
  ('UAH', 45.00000000, CURRENT_DATE, 'seed'),
  ('RUB', 98.00000000, CURRENT_DATE, 'seed'),
  ('PLN', 4.30000000,  CURRENT_DATE, 'seed'),
  ('CHF', 0.95000000,  CURRENT_DATE, 'seed')
ON CONFLICT (quote_currency, as_of_date) DO NOTHING;
