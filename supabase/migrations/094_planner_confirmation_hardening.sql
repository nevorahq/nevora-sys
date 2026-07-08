-- ============================================================
-- Migration 094: Planner Confirmation Hardening (Phase B / B4)
-- ============================================================
-- Phase B requires two guarantees the Capture Inbox did not yet enforce:
--
--   Security requirement #3 — "a draft cannot be confirmed twice".
--   Edge case #2          — "draft source entity deleted -> draft becomes expired".
--
-- Requirement #3 was violated by a TOCTOU window in acceptPlannerSuggestion:
-- the service read `status`, created the business entity, and only then wrote
-- `status = 'accepted'`. Two concurrent confirms (double click, retry, two tabs)
-- both passed the read and both created an entity. The ordering protected against
-- "accepted with no entity", but not against duplicates.
--
-- The fix is a claim state. Accept now atomically moves
-- pending|edited -> 'processing' with a guarded UPDATE; exactly one caller can win
-- that transition, and only the winner proceeds to create the entity. Because the
-- entity is created by TypeScript module services (createStandardTask,
-- createFinancialTask, …) and not by SQL, a single database transaction cannot
-- span the whole operation — the claim state is what makes the operation
-- effectively once-only, and the reaper below cleans up after a crashed claim.
--
-- This migration:
--   A. planner_suggestions.status gains 'processing' + a claimed_at timestamp
--   B. Indexes for the two sweep access paths
--   C. reconcile_stuck_planner_suggestions() — repairs claims orphaned by a crash
--   D. expire_orphaned_planner_suggestions() — edge case #2
--   E. Grants: both functions are service-role only (cross-org sweep)

BEGIN;

-- ============================================================
-- A. 'processing' claim state
-- ============================================================
-- 'processing' is a transient, non-reviewable state: the Inbox review queue
-- filters on pending|edited, so a claimed suggestion disappears from the queue
-- for the duration of the accept and reappears if the accept fails.
ALTER TABLE public.planner_suggestions
  DROP CONSTRAINT IF EXISTS planner_suggestions_status_check;

ALTER TABLE public.planner_suggestions
  ADD CONSTRAINT planner_suggestions_status_check CHECK (
    status IN ('pending', 'processing', 'accepted', 'edited', 'rejected', 'expired', 'failed')
  );

ALTER TABLE public.planner_suggestions
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NULL;

COMMENT ON COLUMN public.planner_suggestions.claimed_at IS
  'Set when a confirm claims the suggestion (status -> processing). Cleared on accept/revert. A claim older than the reaper timeout is considered crashed and released back to pending.';

-- A claim is only meaningful while processing; enforce the pairing so a stray
-- claimed_at can never make a pending row look claimed.
ALTER TABLE public.planner_suggestions
  DROP CONSTRAINT IF EXISTS planner_suggestions_claimed_at_check;

ALTER TABLE public.planner_suggestions
  ADD CONSTRAINT planner_suggestions_claimed_at_check CHECK (
    (status = 'processing') = (claimed_at IS NOT NULL)
  );

-- ============================================================
-- B. Indexes for the sweep access paths
-- ============================================================
CREATE INDEX IF NOT EXISTS planner_suggestions_stuck_claim_idx
  ON public.planner_suggestions (claimed_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS planner_suggestions_open_idx
  ON public.planner_suggestions (created_at)
  WHERE status IN ('pending', 'edited');

-- ============================================================
-- C. reconcile_stuck_planner_suggestions — repair crashed claims
-- ============================================================
-- If the Node process dies mid-confirm the row stays 'processing' forever and
-- vanishes from the review queue. Which repair is correct depends on how far the
-- confirm got, and `accepted_entity_id` is the witness that tells us:
--
--   accepted_entity_id IS NULL     -> the business entity was never recorded.
--                                     Release the claim back to 'pending'.
--   accepted_entity_id IS NOT NULL -> the entity exists but the status flip never
--                                     landed. Finish the job: flip to 'accepted'.
--
-- This is why acceptPlannerSuggestion writes accepted_entity_id BEFORE flipping
-- the status: it turns a crash into a decidable state instead of a coin flip
-- between "lose the suggestion" and "create a duplicate entity".
--
-- Residual window: a crash after the module service created the entity but
-- before accepted_entity_id was written (one round-trip) still looks like
-- "never recorded" and can yield a duplicate on retry. Closing it fully would
-- require the entity insert and this bookkeeping to share one transaction, which
-- they cannot — entity creation lives in TypeScript module services.
--
-- An 'edited' suggestion released here returns as 'pending'. Its edits live in
-- proposed_payload/title, so nothing the user typed is lost — only the "was
-- edited" marker. That is the deliberate trade-off for not carrying a separate
-- pre-claim-status column.
CREATE OR REPLACE FUNCTION public.reconcile_stuck_planner_suggestions(
  p_timeout_minutes int DEFAULT 15,
  p_limit           int DEFAULT 500
)
RETURNS TABLE (released int, finalized int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH stuck AS (
    SELECT id, accepted_entity_id
    FROM public.planner_suggestions
    WHERE status = 'processing'
      AND claimed_at < now() - make_interval(mins => p_timeout_minutes)
    ORDER BY claimed_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), repaired AS (
    UPDATE public.planner_suggestions s
    SET status     = CASE WHEN stuck.accepted_entity_id IS NULL THEN 'pending' ELSE 'accepted' END,
        claimed_at = NULL,
        updated_at = now()
    FROM stuck
    WHERE s.id = stuck.id
      AND s.status = 'processing'
    RETURNING s.id, s.status
  )
  SELECT
    count(*) FILTER (WHERE status = 'pending')::int  AS released,
    count(*) FILTER (WHERE status = 'accepted')::int AS finalized
  FROM repaired;
$$;

COMMENT ON FUNCTION public.reconcile_stuck_planner_suggestions(int, int) IS
  'Sweep: repairs planner_suggestions left in ''processing'' by a crashed confirm — releases them to ''pending'' when no entity was recorded, finalizes them to ''accepted'' when one was. Service-role only.';

-- ============================================================
-- D. expire_orphaned_planner_suggestions — Phase B edge case #2
-- ============================================================
-- A suggestion whose originating entity is gone can never be meaningfully
-- confirmed, so it flips to 'expired' instead of sitting in the review queue.
--
-- Delete semantics differ per source table and are NOT uniform:
--   documents, todos, money_transactions -> soft delete (deleted_at)
--   subscriptions, projects              -> hard delete (row disappears)
-- Both shapes are handled below. planner_entries keeps these pointers FK-free
-- by design (migration 080), which is exactly why this reconciliation is needed.
--
-- Only pending|edited are touched: 'processing' belongs to an in-flight confirm,
-- and accepted/rejected are terminal history that must never be rewritten.
CREATE OR REPLACE FUNCTION public.expire_orphaned_planner_suggestions(
  p_limit int DEFAULT 500
)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH orphaned AS (
    SELECT s.id
    FROM public.planner_suggestions s
    JOIN public.planner_entries e ON e.id = s.planner_entry_id
    WHERE s.status IN ('pending', 'edited')
      AND (
           (e.source_document_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM public.documents d
              WHERE d.id = e.source_document_id AND d.deleted_at IS NULL))
        OR (e.source_task_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM public.todos t
              WHERE t.id = e.source_task_id AND t.deleted_at IS NULL))
        OR (e.source_transaction_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM public.money_transactions m
              WHERE m.id = e.source_transaction_id AND m.deleted_at IS NULL))
        OR (e.source_subscription_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM public.subscriptions sub
              WHERE sub.id = e.source_subscription_id))
        OR (e.source_project_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM public.projects p
              WHERE p.id = e.source_project_id))
      )
    ORDER BY s.created_at
    LIMIT p_limit
    FOR UPDATE OF s SKIP LOCKED
  ), expired AS (
    UPDATE public.planner_suggestions s
    SET status     = 'expired',
        updated_at = now()
    FROM orphaned o
    WHERE s.id = o.id
      AND s.status IN ('pending', 'edited')
    RETURNING s.id
  )
  SELECT count(*)::int FROM expired;
$$;

COMMENT ON FUNCTION public.expire_orphaned_planner_suggestions(int) IS
  'Sweep: expires pending/edited planner_suggestions whose source entity was deleted (Phase B edge case #2). Service-role only.';

-- ============================================================
-- E. Grants — sweep functions run cross-org, service-role only
-- ============================================================
-- SECURITY DEFINER + cross-org reach means these must never be reachable from a
-- user session; the daily sweep calls them with the service-role client.
REVOKE ALL ON FUNCTION public.reconcile_stuck_planner_suggestions(int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stuck_planner_suggestions(int, int)
  TO service_role;

REVOKE ALL ON FUNCTION public.expire_orphaned_planner_suggestions(int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_orphaned_planner_suggestions(int)
  TO service_role;

COMMIT;
