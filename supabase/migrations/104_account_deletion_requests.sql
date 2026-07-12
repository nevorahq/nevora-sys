-- ============================================================
-- Migration 104: Account deletion requests (self-service, soft-delete + grace)
-- ============================================================
-- Backs the self-service "Delete account" flow on /dashboard/settings/profile.
-- Deletion is a two-phase, reversible process rather than an immediate
-- auth.admin.deleteUser():
--
--   phase 1 (this table)  the user requests deletion  -> status='pending',
--                         purge_after = now() + grace window (30 days).
--                         The user can still sign in and CANCEL until then.
--   phase 2 (cron purge)  after purge_after, a machine route re-checks the
--                         sole-owner guard, cascade-deletes the user's solo
--                         organizations, then auth.admin.deleteUser() -> the FK
--                         cleanup from migrations 102/103 makes that safe.
--                         status flips to 'purged'.
--
-- This is account-level, NOT org-level state (a person, not an organization,
-- is being erased), so it is scoped by user_id alone — no organization_id and
-- no is_org_member() check, unlike the business tables.
--
-- This migration:
--   A. account_deletion_requests + constraints
--   B. Indexes (one active request per user; purge scan)
--   C. updated_at trigger
--   D. RLS — per-user; cron uses the service-role key which bypasses RLS

BEGIN;

-- ============================================================
-- A. account_deletion_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- CASCADE so that if an operator hard-deletes the auth user out of band
  -- (e.g. Supabase dashboard), the dangling request row goes with them.
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'cancelled', 'purged')),

  -- Optional free-form reason captured at request time (never shown to others).
  reason        text NULL,

  requested_at  timestamptz NOT NULL DEFAULT now(),
  -- End of the grace window. The cron purge only acts on rows past this.
  purge_after   timestamptz NOT NULL,
  cancelled_at  timestamptz NULL,
  purged_at     timestamptz NULL,

  -- Where the request originated ('dashboard' today; room for 'support', 'api').
  created_via   text NOT NULL DEFAULT 'dashboard',

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- The grace window must be in the future at creation time.
  CONSTRAINT account_deletion_requests_purge_after_future
    CHECK (purge_after > requested_at),

  -- Terminal states must record when they happened; pending must not.
  CONSTRAINT account_deletion_requests_cancelled_pairing
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT account_deletion_requests_purged_pairing
    CHECK ((status = 'purged') = (purged_at IS NOT NULL))
);

COMMENT ON TABLE public.account_deletion_requests IS
  'Self-service account deletion: soft request + 30-day grace window, purged by cron. Account-level, scoped by user_id only.';
COMMENT ON COLUMN public.account_deletion_requests.purge_after IS
  'End of the grace window; cron purge acts only on pending rows past this instant.';

-- ============================================================
-- B. Indexes
-- ============================================================
-- At most one active (pending) request per user. A cancelled/purged history is
-- allowed to accumulate, so the uniqueness is partial on status='pending'.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
  ON public.account_deletion_requests (user_id)
  WHERE status = 'pending';

-- The purge sweep asks one question: which pending rows are past their window?
CREATE INDEX IF NOT EXISTS account_deletion_requests_purge_scan
  ON public.account_deletion_requests (purge_after)
  WHERE status = 'pending';

-- ============================================================
-- C. updated_at trigger
-- ============================================================
DROP TRIGGER IF EXISTS account_deletion_requests_updated_at
  ON public.account_deletion_requests;
CREATE TRIGGER account_deletion_requests_updated_at
  BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- D. RLS
-- ============================================================
-- Per-user, account-level. A user may read, create, and cancel ONLY their own
-- request. There is deliberately no DELETE policy: rows are immutable history,
-- transitioned via status. The cron purge uses the service-role key, which
-- bypasses RLS entirely.
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_deletion_requests_select"
  ON public.account_deletion_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "account_deletion_requests_insert"
  ON public.account_deletion_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Update is the cancel path only; the user can never move a row to 'purged'
-- (that is the cron's job under service-role). We cannot reference NEW.status
-- from a policy, so the action layer enforces pending->cancelled; the policy
-- just confines the update to the user's own rows.
CREATE POLICY "account_deletion_requests_update"
  ON public.account_deletion_requests FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
