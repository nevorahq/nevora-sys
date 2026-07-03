-- =============================================================================
-- Migration 077: Phase 7.4 — data integrity & hot-path indexes
-- =============================================================================
--
-- Audit (docs/audits/phase-7-data-integrity-audit.md) found three tables whose
-- hottest queries had no supporting index. All other core tables already carry
-- organization_id / foreign-key indexes and the entity_links partial-unique
-- index (047) already prevents duplicate active links.
--
-- These are additive, non-destructive CREATE INDEX IF NOT EXISTS statements.
-- No CONCURRENTLY (migrations run in a transaction); the tables are small enough
-- on a fresh production database that the brief write lock is acceptable.
-- =============================================================================

-- 1. documents — had NO secondary index at all. The Documents list filters by
-- organization_id and orders by updated_at DESC; the "documents for an entity"
-- lookup filters organization_id + entity_type + entity_id.
CREATE INDEX IF NOT EXISTS documents_org_updated_idx
  ON public.documents (organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS documents_org_entity_idx
  ON public.documents (organization_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- 2. domain_events — had NO indexes. Analytics (activity timeline, dashboard
-- metrics) read by organization_id ordered by created_at; automation/relation
-- lookups read by (aggregate_type, aggregate_id). This table is append-heavy,
-- so keep the index set lean.
CREATE INDEX IF NOT EXISTS domain_events_org_created_idx
  ON public.domain_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS domain_events_aggregate_idx
  ON public.domain_events (aggregate_type, aggregate_id);

-- 3. document_attachments — the enforce_storage_bytes_limit trigger (072) runs
-- SUM(size_bytes) WHERE organization_id on EVERY attachment insert, and the
-- document detail page joins attachments by document_id. Both were unindexed.
CREATE INDEX IF NOT EXISTS document_attachments_org_idx
  ON public.document_attachments (organization_id);

CREATE INDEX IF NOT EXISTS document_attachments_document_idx
  ON public.document_attachments (document_id);
