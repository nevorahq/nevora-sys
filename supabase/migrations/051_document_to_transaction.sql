-- ============================================================
-- Migration 051: Document-to-Transaction Automation
-- ============================================================
-- Turns an uploaded receipt / invoice / payment confirmation into a linked
-- draft money transaction. New tables describe the extraction pipeline and
-- its normalized financial output; money_transactions gains provenance
-- columns; documents.doc_type learns the financial document types.
--
-- Pipeline (orchestrated server-side, never trusts client payload):
--   documents (doc_type=receipt|invoice|payment_confirmation)
--     → document_extractions          (the "job": provider + status + raw/normalized)
--       → financial_document_data      (normalized header)
--       → financial_document_items     (normalized line items)
--         → money_transactions (status='planned' = DRAFT, source_document_id set)
--           → entity_links (document → transaction, auto, confidence)
--             → action_items (draft_review | document_review)
--
-- Money status mapping (reuses migration 041, does NOT add a new enum):
--   planned = DRAFT awaiting confirmation (excluded from balance RPC)
--   posted  = CONFIRMED (counts in balance) — confirm = planned→posted
--   reject  = soft-delete the planned row (deleted_at)
--
-- Principles (as in 006/040/047/048):
--   • organization_id + workspace_id on every business table
--   • RLS enabled, every INSERT/UPDATE policy carries WITH CHECK
--   • org/workspace/created_by resolved from the authenticated context
--   • writer roles write via can_write_data(); NO service role in app code
-- ============================================================


-- ============================================================
-- 1. DOCUMENTS — extend doc_type vocabulary with financial types
-- ============================================================
-- The inline CHECK from migration 009 is auto-named documents_doc_type_check.
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_doc_type_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN (
    'note', 'template', 'contract', 'report', 'sop', 'other',
    -- Financial document types (Document-to-Transaction Automation)
    'receipt', 'invoice', 'payment_confirmation', 'statement', 'unknown'
  ));


-- ============================================================
-- 2. DOCUMENT_EXTRACTIONS  (the extraction job + result)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_extractions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id      UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,
  document_id       UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,

  provider          TEXT        NOT NULL DEFAULT 'pdf_parse'
                      CHECK (provider IN (
                        'pdf_parse', 'anthropic_vision', 'openai', 'google_vision',
                        'azure_document_intelligence', 'mindee', 'veryfi', 'manual'
                      )),

  status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending', 'processing', 'completed', 'failed', 'needs_review'
                      )),

  raw_text          TEXT,
  raw_json          JSONB,
  normalized_json   JSONB,
  confidence_score  NUMERIC     CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),

  error_code        TEXT,
  error_message     TEXT,

  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_by        UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.document_extractions IS
  'Extraction jobs + results for Document-to-Transaction. One row per extraction attempt; doubles as the queue-able job record.';

CREATE INDEX IF NOT EXISTS document_extractions_org_doc_idx
  ON public.document_extractions (organization_id, document_id);
CREATE INDEX IF NOT EXISTS document_extractions_org_status_idx
  ON public.document_extractions (organization_id, status);

-- Prevent two concurrent in-flight extractions for the same document.
CREATE UNIQUE INDEX IF NOT EXISTS document_extractions_one_in_flight_idx
  ON public.document_extractions (document_id)
  WHERE status IN ('pending', 'processing');


-- ============================================================
-- 3. FINANCIAL_DOCUMENT_DATA  (normalized header)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financial_document_data (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id         UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,
  document_id          UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  extraction_id        UUID                 REFERENCES public.document_extractions(id) ON DELETE SET NULL,

  document_type        TEXT        NOT NULL DEFAULT 'unknown'
                         CHECK (document_type IN (
                           'receipt', 'invoice', 'payment_confirmation', 'unknown'
                         )),

  merchant_name        TEXT,
  merchant_tax_id      TEXT,
  document_number      TEXT,
  transaction_date     DATE,
  currency             TEXT,
  subtotal_amount      NUMERIC,
  tax_amount           NUMERIC,
  total_amount         NUMERIC,
  payment_method       TEXT,
  suggested_category_id UUID                REFERENCES public.money_categories(id) ON DELETE SET NULL,
  confidence_score     NUMERIC     CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One normalized header per document (re-extraction upserts this row).
  CONSTRAINT financial_document_data_document_unique UNIQUE (document_id)
);

COMMENT ON TABLE public.financial_document_data IS
  'Normalized financial header extracted from a document (merchant, totals, dates).';

CREATE INDEX IF NOT EXISTS financial_document_data_org_idx
  ON public.financial_document_data (organization_id, document_id);
-- Duplicate-detection lookups: merchant + total + currency + date in one org.
CREATE INDEX IF NOT EXISTS financial_document_data_dup_idx
  ON public.financial_document_data (organization_id, merchant_name, total_amount, currency, transaction_date);

CREATE OR REPLACE FUNCTION public.touch_financial_document_data_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_document_data_set_updated_at ON public.financial_document_data;
CREATE TRIGGER financial_document_data_set_updated_at
  BEFORE UPDATE ON public.financial_document_data
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_document_data_updated_at();


-- ============================================================
-- 4. FINANCIAL_DOCUMENT_ITEMS  (normalized line items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financial_document_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id         UUID                 REFERENCES public.workspaces(id) ON DELETE SET NULL,
  document_id          UUID        NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  extraction_id        UUID                 REFERENCES public.document_extractions(id) ON DELETE SET NULL,

  name                 TEXT        NOT NULL,
  quantity             NUMERIC,
  unit_price           NUMERIC,
  total_price          NUMERIC,
  tax_rate             NUMERIC,
  suggested_category_id UUID                REFERENCES public.money_categories(id) ON DELETE SET NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.financial_document_items IS
  'Normalized line items extracted from a financial document.';

CREATE INDEX IF NOT EXISTS financial_document_items_org_doc_idx
  ON public.financial_document_items (organization_id, document_id);


-- ============================================================
-- 5. MONEY_TRANSACTIONS — provenance columns
-- ============================================================
ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS source_document_id   UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_extraction_id UUID REFERENCES public.document_extractions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merchant_name        TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score     NUMERIC
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));

COMMENT ON COLUMN public.money_transactions.source_document_id IS
  'Document this transaction was drafted from (Document-to-Transaction Automation).';

-- Fast "does this document already have a transaction?" + duplicate guard.
CREATE INDEX IF NOT EXISTS money_transactions_source_document_idx
  ON public.money_transactions (organization_id, source_document_id)
  WHERE source_document_id IS NOT NULL;


-- ============================================================
-- 6. RLS
-- ============================================================

-- ── document_extractions ──────────────────────────────────
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_extractions_select" ON public.document_extractions;
CREATE POLICY "document_extractions_select"
  ON public.document_extractions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "document_extractions_insert" ON public.document_extractions;
CREATE POLICY "document_extractions_insert"
  ON public.document_extractions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "document_extractions_update" ON public.document_extractions;
CREATE POLICY "document_extractions_update"
  ON public.document_extractions FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

-- ── financial_document_data ───────────────────────────────
ALTER TABLE public.financial_document_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_document_data_select" ON public.financial_document_data;
CREATE POLICY "financial_document_data_select"
  ON public.financial_document_data FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "financial_document_data_insert" ON public.financial_document_data;
CREATE POLICY "financial_document_data_insert"
  ON public.financial_document_data FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "financial_document_data_update" ON public.financial_document_data;
CREATE POLICY "financial_document_data_update"
  ON public.financial_document_data FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (public.can_write_data(organization_id));

-- ── financial_document_items ──────────────────────────────
ALTER TABLE public.financial_document_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_document_items_select" ON public.financial_document_items;
CREATE POLICY "financial_document_items_select"
  ON public.financial_document_items FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "financial_document_items_insert" ON public.financial_document_items;
CREATE POLICY "financial_document_items_insert"
  ON public.financial_document_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "financial_document_items_delete" ON public.financial_document_items;
CREATE POLICY "financial_document_items_delete"
  ON public.financial_document_items FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id) AND public.can_write_data(organization_id));


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname='public'
--   AND tablename IN ('document_extractions','financial_document_data','financial_document_items');
--
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.documents'::regclass
--   AND conname = 'documents_doc_type_check';
-- ============================================================
