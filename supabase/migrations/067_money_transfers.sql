-- ============================================================
-- Migration 067: internal transfers between money accounts
-- ============================================================
-- Adds a third transaction type, `transfer`, modelling a move of funds from
-- one account to another WITHOUT touching income/expense analytics.
--
-- A transfer is ONE row (not two legs) so it shows as a single neutral entry
-- in Recent Transactions: "Transfer · From → To". Balances are derived (there
-- is no stored balance column), so per-account balance calc subtracts `amount`
-- from `from_account_id` and adds it to `to_account_id`. At the currency level
-- a same-currency transfer nets to zero, so currency totals are unaffected.
--
-- account_id stays NOT NULL (it mirrors from_account_id) to keep every existing
-- query that joins money_accounts(name) and the org/RLS attribution intact.
--
-- Idempotent: safe to re-run.

-- 1. New columns. ON DELETE SET NULL keeps a transfer row (and its ledger
--    history) alive if one of the accounts is later hard-deleted; the account
--    name simply renders as unknown. Active accounts are soft-deleted anyway.
ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS from_account_id UUID REFERENCES public.money_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_account_id   UUID REFERENCES public.money_accounts(id) ON DELETE SET NULL;

-- 2. Allow `transfer` as a transaction type. The inline CHECK from migration
--    000 is auto-named money_transactions_type_check.
ALTER TABLE public.money_transactions
  DROP CONSTRAINT IF EXISTS money_transactions_type_check;

ALTER TABLE public.money_transactions
  ADD CONSTRAINT money_transactions_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));

-- 3. Integrity: a transfer must reference two DISTINCT accounts; an
--    income/expense row must reference neither. This makes a half-built or
--    self-transfer row impossible at the database level.
ALTER TABLE public.money_transactions
  DROP CONSTRAINT IF EXISTS money_transactions_transfer_accounts_check;

ALTER TABLE public.money_transactions
  ADD CONSTRAINT money_transactions_transfer_accounts_check
  CHECK (
    (
      type = 'transfer'
      AND from_account_id IS NOT NULL
      AND to_account_id   IS NOT NULL
      AND from_account_id <> to_account_id
    )
    OR (
      type <> 'transfer'
      AND from_account_id IS NULL
      AND to_account_id   IS NULL
    )
  );

-- 4. Index the destination side so per-account ledger lookups (which now match
--    account_id OR to_account_id) stay fast.
CREATE INDEX IF NOT EXISTS idx_money_transactions_to_account
  ON public.money_transactions (to_account_id)
  WHERE to_account_id IS NOT NULL;

COMMENT ON COLUMN public.money_transactions.from_account_id IS
  'Transfer source account. NULL for income/expense rows.';
COMMENT ON COLUMN public.money_transactions.to_account_id IS
  'Transfer destination account. NULL for income/expense rows.';

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.money_transactions'::regclass
--     AND conname LIKE 'money_transactions_t%_check';
--   -- expect: money_transactions_type_check, money_transactions_transfer_accounts_check
-- ============================================================
