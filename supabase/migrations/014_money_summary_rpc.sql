-- ============================================================
-- Migration 014: Money Summary RPC
-- ============================================================
-- Заменяет 3 отдельных SELECT-запроса из get-money-summary.ts
-- одной агрегирующей PostgreSQL-функцией.
--
-- Функция считает за один round-trip к БД:
--   - balance: initial_balance всех активных счетов + all-time income - all-time expenses
--   - monthly_income: доходы за текущий календарный месяц
--   - monthly_expenses: расходы за текущий календарный месяц
--
-- SECURITY INVOKER (по умолчанию): функция уважает RLS.
-- Пользователь видит только данные своей организации благодаря RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_org_money_summary(p_org_id UUID)
RETURNS TABLE(
  balance           NUMERIC,
  monthly_income    NUMERIC,
  monthly_expenses  NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
  WITH
    initial_balances AS (
      SELECT COALESCE(SUM(initial_balance), 0) AS total
      FROM   public.money_accounts
      WHERE  organization_id = p_org_id
        AND  is_active        = true
        AND  deleted_at       IS NULL
    ),
    all_time AS (
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
      FROM   public.money_transactions
      WHERE  organization_id = p_org_id
        AND  deleted_at       IS NULL
    ),
    monthly AS (
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
      FROM   public.money_transactions
      WHERE  organization_id  = p_org_id
        AND  deleted_at        IS NULL
        AND  transaction_date >= date_trunc('month', CURRENT_DATE)::DATE
        AND  transaction_date <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE
    )
  SELECT
    (ib.total + at.income - at.expenses) AS balance,
    mo.income                            AS monthly_income,
    mo.expenses                          AS monthly_expenses
  FROM initial_balances ib, all_time at, monthly mo
$$;
