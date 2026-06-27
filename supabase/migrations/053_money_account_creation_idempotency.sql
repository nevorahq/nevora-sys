-- ============================================================
-- Migration 053: Money account creation idempotency
-- ============================================================
-- Reconciles account attribution columns used by the application and adds a
-- request-scoped idempotency key. Multiple accounts may share a currency/name;
-- only retries of the same creation request are deduplicated.
-- ============================================================

ALTER TABLE public.money_accounts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creation_request_id UUID;

COMMENT ON COLUMN public.money_accounts.creation_request_id IS
  'Client-generated request UUID used only to make account creation retries idempotent.';

CREATE UNIQUE INDEX IF NOT EXISTS money_accounts_org_creation_request_uidx
  ON public.money_accounts (organization_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;
