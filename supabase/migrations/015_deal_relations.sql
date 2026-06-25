-- ============================================================
-- Migration 015: Deal Relations
-- ============================================================
-- Добавляет deal_id в таблицы todos и money_transactions.
--
-- Связи:
--   todos.deal_id           → crm_deals(id)  Deal → Task
--   money_transactions.deal_id → crm_deals(id)  Deal → Transaction
--
-- ON DELETE SET NULL: удаление сделки не удаляет задачи/транзакции,
-- просто разрывает связь. Финансовые и задачные данные сохраняются.
-- ============================================================

-- Deal → Task
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_todos_deal_id
  ON public.todos (deal_id)
  WHERE deal_id IS NOT NULL;

-- Deal → Transaction
ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.crm_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_money_transactions_deal_id
  ON public.money_transactions (deal_id)
  WHERE deal_id IS NOT NULL;
