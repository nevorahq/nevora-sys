-- ============================================================
-- Migration 013: RLS for plans table
-- ============================================================
-- Таблица plans была создана в 012_saas_billing.sql без RLS.
-- Добавляем ENABLE ROW LEVEL SECURITY и политику публичного
-- чтения для аутентифицированных пользователей.
--
-- plans — публичные данные (тарифы), поэтому SELECT открыт.
-- INSERT/UPDATE/DELETE — только через service_role (backoffice).
-- ============================================================

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view plans" ON public.plans;
CREATE POLICY "Authenticated users can view plans"
  ON public.plans
  FOR SELECT
  TO authenticated
  USING (true);
