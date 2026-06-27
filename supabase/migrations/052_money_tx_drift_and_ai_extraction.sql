-- ============================================================
-- Migration 052: money_transactions drift reconcile + AI extraction quota
-- ============================================================
-- Two self-sufficiency fixes uncovered while reviewing Document-to-Transaction:
--
-- 1. DRIFT RECONCILE (like 031 for todos). money_transactions.workspace_id /
--    created_by / updated_by exist in the LIVE database but were never added by
--    a migration — 004 added those three to `todos` only, and to the money
--    tables it added just organization_id + deleted_at. Every money write
--    (create-transaction.action.ts AND the new document-draft service) sets
--    these columns, so a DB rebuilt purely from migrations/ would fail on insert.
--    Adding them IF NOT EXISTS is a no-op on the live DB and restores parity.
--
-- 2. AI QUOTA. Document extraction calls Anthropic but must consume the same
--    monthly `ai_calls` quota as the other AI features. That quota is enforced
--    by the start_limit_ai_requests trigger on INSERT into ai_requests (033),
--    whose action_type CHECK only allowed summary/insights/recommendations.
--    Add 'document_extraction' so the normalizer can record a ledger row.
--
-- Both changes are additive + idempotent. No backfill, no RLS change.
-- ============================================================


-- ============================================================
-- 1. money_transactions drift reconcile
-- ============================================================
ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.money_transactions.workspace_id IS
  'Workspace scope (nullable); set by money create/draft actions. Reconciled from live-DB drift in 052.';
COMMENT ON COLUMN public.money_transactions.created_by IS
  'auth.users.id of the creator; SET NULL on user delete. Reconciled in 052.';
COMMENT ON COLUMN public.money_transactions.updated_by IS
  'auth.users.id of the last editor; SET NULL on user delete. Reconciled in 052.';

CREATE INDEX IF NOT EXISTS money_transactions_workspace_idx
  ON public.money_transactions (organization_id, workspace_id);


-- ============================================================
-- 2. ai_requests.action_type — allow 'document_extraction'
-- ============================================================
-- The inline CHECK from 033 is auto-named ai_requests_action_type_check.
ALTER TABLE public.ai_requests
  DROP CONSTRAINT IF EXISTS ai_requests_action_type_check;

ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_action_type_check
  CHECK (action_type IN ('summary', 'insights', 'recommendations', 'document_extraction'));


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='money_transactions'
--   AND column_name IN ('workspace_id','created_by','updated_by');  -- expect 3 rows
--
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname='ai_requests_action_type_check';  -- includes document_extraction
-- ============================================================
