-- ============================================================
-- Migration 105: Universal Capture Inbox — upload idempotency
-- ============================================================
-- The Inbox can now capture photos and documents, not just text. A capture is a
-- multipart upload over the network, so a dropped connection and an automatic
-- retry are ordinary — and a naive retry would create a SECOND Document, a
-- second planner entry, a second suggestion and a second Action Center item for
-- the exact same file.
--
-- Two database-level guards make one retry safe, independent of any application
-- logic above them:
--
--   A. documents.inbox_capture_id — a client-generated token per capture attempt.
--      UNIQUE per (organization, creator) so a retried POST reuses the Document
--      the first attempt already stored instead of duplicating it.
--
--   B. planner_entries — a Document may seed AT MOST ONE Inbox capture entry.
--      UNIQUE per (organization, owner, source_document_id) so document-to-entry
--      linking is exactly-once even across a crash between "Document stored" and
--      "entry created" (the reconciler re-reads the winner instead of inserting).
--
-- Both indexes are partial (token/pointer present, row live) so hand-created
-- Documents and text captures — which carry neither — are never constrained.
--
-- Money safety is unchanged: this migration adds no path from an upload to a
-- posted transaction. It only prevents duplicates.
--
-- Idempotent: safe to re-run.
-- ============================================================

BEGIN;

-- ============================================================
-- A. documents.inbox_capture_id — dedupe a retried Inbox upload
-- ============================================================
-- Nullable and FK-free: only Inbox captures carry it, and a purged capture token
-- must not cascade into stored business documents. The Documents dashboard form
-- leaves it NULL and is unaffected.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS inbox_capture_id uuid NULL;

COMMENT ON COLUMN public.documents.inbox_capture_id IS
  'Client-generated idempotency token for an Inbox photo/document capture. NULL '
  'for documents created from the Documents screen. A retried upload with the '
  'same token reuses this Document instead of storing a second copy.';

CREATE UNIQUE INDEX IF NOT EXISTS documents_inbox_capture_unique_idx
  ON public.documents (organization_id, created_by, inbox_capture_id)
  WHERE inbox_capture_id IS NOT NULL
    AND deleted_at IS NULL;

COMMENT ON INDEX public.documents_inbox_capture_unique_idx IS
  'Exactly-once for Inbox captures: one Document per (org, creator, capture '
  'token). A network retry collides here (23505) and the upload service re-reads '
  'and returns the Document that already exists. Partial so only Inbox captures '
  'are constrained and a soft-deleted Document never blocks a fresh capture.';

-- ============================================================
-- B. planner_entries — one capture entry per source Document
-- ============================================================
-- A document-sourced capture points at its Document via source_document_id. This
-- makes that pointer unique per owner, so a Document can seed at most one Inbox
-- entry. createSourcedPlannerEntry depends on the 23505 to return the existing
-- entry rather than inserting a duplicate on retry / reconcile.
CREATE UNIQUE INDEX IF NOT EXISTS planner_entries_source_document_unique_idx
  ON public.planner_entries (organization_id, owner_user_id, source_document_id)
  WHERE source_document_id IS NOT NULL;

COMMENT ON INDEX public.planner_entries_source_document_unique_idx IS
  'Exactly-once for document-sourced Inbox captures: one planner_entry per (org, '
  'owner, source_document_id). Guards the "Document stored but linking crashed" '
  'window — the retry/reconcile collides here and reuses the existing entry.';

-- ============================================================
-- C. Assert the invariant this migration establishes
-- ============================================================
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF to_regclass('public.documents_inbox_capture_unique_idx') IS NULL THEN
    v_missing := v_missing || 'documents_inbox_capture_unique_idx ';
  END IF;
  IF to_regclass('public.planner_entries_source_document_unique_idx') IS NULL THEN
    v_missing := v_missing || 'planner_entries_source_document_unique_idx ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION
      '105: Inbox capture is not idempotent — missing unique index(es): %',
      v_missing;
  END IF;
END;
$$;

COMMIT;
