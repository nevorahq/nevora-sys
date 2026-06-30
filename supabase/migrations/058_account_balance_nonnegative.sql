-- ============================================================
-- Migration 058: account starting balance cannot be negative
-- ============================================================
-- A money account's `initial_balance` is "money you already have" and must
-- never be negative. A negative starting balance silently corrupts the
-- cumulative Current Balance — e.g. an account created with -360 makes the
-- balance show MDL -360,00 with no transactions at all.
--
-- The application already rejects negative input (account.schema.ts → .min(0)),
-- but rows created before that guard can still hold negative values. This
-- migration:
--   1. REPAIRS existing data: clamps any negative starting balance to 0.
--   2. ENFORCES the invariant at the database level (CHECK >= 0), so it can
--      never reappear regardless of the write path.
--
-- Idempotent: safe to re-run.

-- 1. Repair existing data. The set_updated_at trigger bumps updated_at.
UPDATE public.money_accounts
SET    initial_balance = 0
WHERE  initial_balance < 0;

-- 2. Enforce the invariant going forward (drop-then-add keeps re-runs clean).
ALTER TABLE public.money_accounts
  DROP CONSTRAINT IF EXISTS money_accounts_initial_balance_nonnegative;

ALTER TABLE public.money_accounts
  ADD CONSTRAINT money_accounts_initial_balance_nonnegative
  CHECK (initial_balance >= 0);

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM public.money_accounts WHERE initial_balance < 0;
--   -- expect 0
-- ============================================================
