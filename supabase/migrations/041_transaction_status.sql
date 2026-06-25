-- ============================================================
-- Migration 041: money_transactions.status (posted | planned)
-- ============================================================
-- Вводит понятие «отложенной» (запланированной) транзакции для блока
-- «Предстоящие расходы» на дашборде Money.
--
--   posted  — фактическая транзакция. Учитывается в Balance и
--             Monthly Expenses (текущее поведение, default).
--   planned — запланированный будущий расход. НЕ влияет на баланс,
--             пока не «проведён» (переведён в posted). Показывается
--             только в прогнозе «Предстоящие расходы».
--
-- Все существующие строки получают 'posted' → поведение не меняется.
-- RLS не трогаем: та же таблица, те же политики.
-- ============================================================

ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted', 'planned'));

COMMENT ON COLUMN public.money_transactions.status IS
  'posted = фактическая (в балансе); planned = запланированная (только в прогнозе «Предстоящие расходы»), не влияет на баланс до проведения.';

-- Прогноз «Предстоящие расходы» спрашивает planned-расходы в окне дат:
-- (organization_id, status, transaction_date). Частичный индекс — только
-- planned-строки, чтобы не раздувать индекс фактическими транзакциями.
CREATE INDEX IF NOT EXISTS money_transactions_planned_idx
  ON public.money_transactions (organization_id, transaction_date)
  WHERE status = 'planned';

-- ============================================================
-- PATCH: get_org_money_summary — исключить planned из баланса
-- ============================================================
-- RPC из 014 считает Balance/Monthly по money_transactions. Чтобы
-- запланированные расходы не «протекали» в факт — фильтруем status='posted'.
-- CREATE OR REPLACE сохраняет существующие GRANT EXECUTE.

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
        AND  status           = 'posted'
    ),
    monthly AS (
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
      FROM   public.money_transactions
      WHERE  organization_id  = p_org_id
        AND  deleted_at        IS NULL
        AND  status            = 'posted'
        AND  transaction_date >= date_trunc('month', CURRENT_DATE)::DATE
        AND  transaction_date <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE
    )
  SELECT
    (ib.total + at.income - at.expenses) AS balance,
    mo.income                            AS monthly_income,
    mo.expenses                          AS monthly_expenses
  FROM initial_balances ib, all_time at, monthly mo
$$;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'money_transactions' AND column_name = 'status';
--
-- SELECT status, count(*) FROM public.money_transactions GROUP BY status;
--   -- ожидаем: все существующие = posted
-- ============================================================
