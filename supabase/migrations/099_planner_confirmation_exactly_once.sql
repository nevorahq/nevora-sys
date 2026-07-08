-- ============================================================
-- Migration 099: Planner confirmation — exactly-once, enforced by constraints
-- ============================================================
-- 094 introduced the 'processing' claim, which closed the double-click race:
-- exactly one caller wins `pending|edited -> processing`, so only one caller ever
-- reaches entity creation. 094's own header names the window it could not close:
--
--   "a crash after the module service created the entity but before
--    accepted_entity_id was written (one round-trip) still looks like
--    'never recorded' and can yield a duplicate on retry."
--
-- That window is real. `reconcile_stuck_planner_suggestions` uses
-- accepted_entity_id as the witness for "did we get that far?", so a crash before
-- the witness is written releases the suggestion back to 'pending', and the retry
-- creates a SECOND entity. The claim makes confirmation at-most-once *per
-- process*; it cannot make it once *across* a crash.
--
-- The claim is an application-level check. This migration makes the invariant a
-- database-level one, so a retry cannot duplicate even if every line of
-- TypeScript above it is wrong.
--
-- Per accept route, keyed on the suggestion that produced the entity:
--
--   create_action_item  -> already safe: action_items_dedupe_idx is UNIQUE on
--                          (organization_id, type, source_type, source_id).
--   link_entities       -> already safe: entity_links_unique_active_idx.
--   create_financial_*  -> createFinancialTask *believes* it is idempotent: it
--                          catches 23505 and re-reads the winner. But no unique
--                          index on (organization_id, financial_source_type,
--                          financial_source_id) exists, so 23505 is never raised
--                          and that recovery branch is unreachable. Two confirms
--                          both insert. Fixed in A below.
--   create_task         -> createStandardTask has no source key whatsoever.
--                          Nothing links the todo back to the suggestion, so
--                          nothing can detect a repeat. Fixed in B below.
--
-- Both indexes are partial on `deleted_at IS NULL`: a soft-deleted task must not
-- block the user from confirming a fresh one, and the app's dedup re-reads filter
-- on the same predicate.
--
-- Verified before writing: production holds 0 rows that would violate either
-- index, and 0 suggestions stuck in 'processing'.
--
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

-- ============================================================
-- A. Make createFinancialTask's idempotency real
-- ============================================================
-- createFinancialTask short-circuits on an existing (org, source_type, source_id)
-- task and, on insert, catches 23505 to return the row a concurrent creator won.
-- Without this index the short-circuit is a TOCTOU read and the 23505 branch is
-- dead code. With it, two concurrent confirms produce one task and one re-read.
CREATE UNIQUE INDEX IF NOT EXISTS todos_financial_source_unique_idx
  ON public.todos (organization_id, financial_source_type, financial_source_id)
  WHERE financial_source_id IS NOT NULL
    AND deleted_at IS NULL;

COMMENT ON INDEX public.todos_financial_source_unique_idx IS
  'Exactly-once for financial tasks created from a source (planner suggestion, '
  'document, subscription cycle). createFinancialTask depends on this index to '
  'raise 23505 so it can return the existing task instead of inserting a second. '
  'Partial on deleted_at IS NULL so a soft-deleted task never blocks a new confirm.';

-- ============================================================
-- B. Give planner-created standard tasks a source key
-- ============================================================
-- create_task routes to createStandardTask, which records no provenance at all.
-- A retry after a crashed confirm therefore has nothing to collide with. The
-- column is nullable: tasks created by hand from the dashboard carry no
-- suggestion and must not be forced into a dedup key.
ALTER TABLE public.todos
  ADD COLUMN IF NOT EXISTS source_suggestion_id uuid NULL;

COMMENT ON COLUMN public.todos.source_suggestion_id IS
  'The planner_suggestion whose confirmation created this task, when it came from '
  'the Capture Inbox. NULL for hand-created tasks. Deliberately FK-free, matching '
  'planner_entries (080): a purged suggestion must not cascade into business data.';

CREATE UNIQUE INDEX IF NOT EXISTS todos_source_suggestion_unique_idx
  ON public.todos (organization_id, source_suggestion_id)
  WHERE source_suggestion_id IS NOT NULL
    AND deleted_at IS NULL;

COMMENT ON INDEX public.todos_source_suggestion_unique_idx IS
  'Exactly-once for standard tasks confirmed from a planner suggestion. A retry '
  'after a crash between "entity created" and "accepted_entity_id written" hits '
  'this index (23505) instead of creating a duplicate task; the service re-reads '
  'and returns the task that already exists.';

-- ============================================================
-- C. Teach the reconciler that a released claim is now retry-safe
-- ============================================================
-- 094's reconciler releases a stuck 'processing' row to 'pending' when
-- accepted_entity_id IS NULL, on the assumption the entity was never created.
-- After A and B that assumption no longer has to hold: if the entity WAS created,
-- the retry collides with a unique index and the service returns the existing
-- entity rather than a second one. Releasing is now always safe.
--
-- The function body is unchanged; only its contract comment is, because the
-- guarantee it participates in has changed and the old comment described a
-- residual duplicate window that no longer exists.
COMMENT ON FUNCTION public.reconcile_stuck_planner_suggestions(int, int) IS
  'Sweep: repairs planner_suggestions left in ''processing'' by a crashed confirm '
  '— releases them to ''pending'' when no entity was recorded, finalizes them to '
  '''accepted'' when one was. Releasing is safe even if the entity was in fact '
  'created: since 099 the retry collides with todos_source_suggestion_unique_idx / '
  'todos_financial_source_unique_idx / action_items_dedupe_idx / '
  'entity_links_unique_active_idx and returns the existing entity. Service-role only.';

-- ============================================================
-- D. Assert the invariant this migration exists to establish
-- ============================================================
-- Every accept route must terminate in a unique constraint keyed on the
-- suggestion. If a future route is added without one, this fails loudly rather
-- than silently reopening the duplicate window.
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF to_regclass('public.todos_financial_source_unique_idx') IS NULL THEN
    v_missing := v_missing || 'todos_financial_source_unique_idx ';
  END IF;
  IF to_regclass('public.todos_source_suggestion_unique_idx') IS NULL THEN
    v_missing := v_missing || 'todos_source_suggestion_unique_idx ';
  END IF;
  IF to_regclass('public.action_items_dedupe_idx') IS NULL THEN
    v_missing := v_missing || 'action_items_dedupe_idx ';
  END IF;
  IF to_regclass('public.entity_links_unique_active_idx') IS NULL THEN
    v_missing := v_missing || 'entity_links_unique_active_idx ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION
      '099: planner confirmation is not exactly-once — missing unique index(es): %',
      v_missing;
  END IF;
END;
$$;

COMMIT;
