-- ============================================================
-- SubTracker Module — Database Schema
-- ============================================================
-- Зависимости:
--   - auth.users (Supabase Auth)
--   - public.handle_updated_at() (из schema.sql — уже существует)
--
-- Выполняй в Supabase SQL Editor ПОСЛЕ schema.sql
-- ============================================================


-- ============================================================
-- 1. ТАБЛИЦА: subscriptions
-- ============================================================
-- Каждая строка = одна подписка пользователя (Netflix, Spotify...).
--
-- amount > 0 — стоимость подписки за один billing_cycle.
--   Weekly $2.99, Monthly $9.99, Yearly $99.99 — amount хранит
--   стоимость ОДНОГО цикла, не приведённую к месяцу.
--   Приведение к monthly/yearly делается в коде через множители.
--
-- next_billing_date — дата СЛЕДУЮЩЕГО списания.
--   Используется для оповещений (за 5/3/1 дней).
--   После списания пользователь вручную обновляет дату (MVP).
--   В будущем — auto-advance после billing date.
--
-- category — тип подписки для аналитики и группировки.
--   CHECK constraint, не ENUM (легко добавить новые).
--
-- is_active — мягкое отключение. Подписка не удаляется,
--   а деактивируется. История сохраняется.

CREATE TABLE public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  amount            NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'MDL',
  billing_cycle     TEXT NOT NULL CHECK (billing_cycle IN ('weekly', 'monthly', 'yearly')),
  next_billing_date DATE NOT NULL,
  category          TEXT NOT NULL DEFAULT 'other'
                      CHECK (category IN ('entertainment', 'productivity', 'cloud', 'education', 'health', 'other')),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  url               TEXT,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS 'User subscription tracking for SubTracker module';


-- ============================================================
-- 2. ИНДЕКСЫ
-- ============================================================

-- Основной: RLS + все запросы фильтруют по user_id
CREATE INDEX idx_subscriptions_user_id
  ON public.subscriptions (user_id);

-- Upcoming renewals: WHERE user_id = ? AND is_active = true AND next_billing_date BETWEEN ...
CREATE INDEX idx_subscriptions_user_active_date
  ON public.subscriptions (user_id, is_active, next_billing_date);

-- Аналитика по категориям: WHERE user_id = ? AND category = ?
CREATE INDEX idx_subscriptions_user_category
  ON public.subscriptions (user_id, category);


-- ============================================================
-- 3. ТРИГГЕР: updated_at
-- ============================================================
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 4. RLS POLICIES
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own subscriptions"
  ON public.subscriptions FOR DELETE
  USING (user_id = auth.uid());
