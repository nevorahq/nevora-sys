-- ============================================================
-- Migration 097: Phase C — Documents / Money / Subscriptions Integration
-- ============================================================
-- Review-first integration layer:
--   document extraction -> financial_suggestions -> explicit confirmation -> transaction
--   subscription signal -> financial_suggestions -> explicit confirmation -> task
--
-- Guardrails:
--   * attachments and extraction never create money_transactions
--   * review_state transitions are validated centrally
--   * subscription task suggestions are idempotent by
--     subscription_id + task_type + billing_period_key
--   * entity_links remains the universal relation table; it is extended with
--     status/source/confidence instead of introducing a duplicate relations table
-- ============================================================

BEGIN;

-- ============================================================
-- A. Document processing result compatibility table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.document_processing_results (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id              UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  document_id               UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  extraction_id             UUID REFERENCES public.document_extractions(id) ON DELETE SET NULL,

  detected_vendor           TEXT,
  detected_amount           NUMERIC(14, 2),
  detected_currency         TEXT,
  detected_issue_date       DATE,
  detected_due_date         DATE,
  detected_document_type    TEXT,
  detected_payment_status   TEXT,
  detected_tax_amount       NUMERIC(14, 2),
  confidence_score          NUMERIC CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  raw_extraction_json       JSONB NOT NULL DEFAULT '{}',

  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT document_processing_results_document_unique UNIQUE (document_id)
);

CREATE INDEX IF NOT EXISTS document_processing_results_org_doc_idx
  ON public.document_processing_results (organization_id, document_id);
CREATE INDEX IF NOT EXISTS document_processing_results_confidence_idx
  ON public.document_processing_results (organization_id, confidence_score);

-- ============================================================
-- B. Financial suggestions and review lifecycle
-- ============================================================
CREATE TABLE IF NOT EXISTS public.financial_suggestions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id           UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,

  source_type            TEXT NOT NULL
                           CHECK (source_type IN ('document', 'subscription', 'relation')),
  source_id              UUID NOT NULL,
  suggestion_type        TEXT NOT NULL
                           CHECK (suggestion_type IN (
                             'create_expense',
                             'review_subscription',
                             'pay_subscription',
                             'request_invoice',
                             'cancel_subscription',
                             'update_payment_method',
                             'check_price_change',
                             'suggest_relation'
                           )),

  review_state           TEXT NOT NULL DEFAULT 'detected'
                           CHECK (review_state IN (
                             'detected',
                             'suggested',
                             'waiting_confirmation',
                             'confirmed',
                             'rejected'
                           )),

  amount                 NUMERIC(14, 2) CHECK (amount IS NULL OR amount > 0),
  currency               TEXT,
  vendor_name            TEXT,
  issue_date             DATE,
  due_date               DATE,
  document_type          TEXT,
  tax_amount             NUMERIC(14, 2),
  payment_status         TEXT,
  confidence_score       NUMERIC CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),

  category_id            UUID REFERENCES public.money_categories(id) ON DELETE SET NULL,
  expense_context_id     UUID REFERENCES public.expense_contexts(id) ON DELETE SET NULL,
  billing_period_key     TEXT,
  idempotency_key        TEXT,

  created_transaction_id UUID REFERENCES public.money_transactions(id) ON DELETE SET NULL,
  created_task_id        UUID REFERENCES public.todos(id) ON DELETE SET NULL,
  rejected_reason        TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}',

  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.financial_suggestions IS
  'Review-first suggestions connecting documents/subscriptions to explicit financial actions.';
COMMENT ON COLUMN public.financial_suggestions.review_state IS
  'detected -> suggested -> waiting_confirmation -> confirmed|rejected; suggested -> rejected.';

CREATE INDEX IF NOT EXISTS financial_suggestions_org_state_idx
  ON public.financial_suggestions (organization_id, review_state, created_at DESC);
CREATE INDEX IF NOT EXISTS financial_suggestions_source_idx
  ON public.financial_suggestions (organization_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS financial_suggestions_due_idx
  ON public.financial_suggestions (organization_id, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS financial_suggestions_document_expense_uniq
  ON public.financial_suggestions (organization_id, source_id, suggestion_type)
  WHERE source_type = 'document' AND suggestion_type = 'create_expense';
CREATE UNIQUE INDEX IF NOT EXISTS financial_suggestions_subscription_task_uniq
  ON public.financial_suggestions (organization_id, source_id, suggestion_type, billing_period_key)
  WHERE source_type = 'subscription' AND billing_period_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS financial_suggestions_idempotency_uniq
  ON public.financial_suggestions (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_financial_suggestions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_suggestions_set_updated_at ON public.financial_suggestions;
CREATE TRIGGER financial_suggestions_set_updated_at
  BEFORE UPDATE ON public.financial_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.touch_financial_suggestions_updated_at();

CREATE OR REPLACE FUNCTION public.validate_financial_suggestion_review_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.review_state = OLD.review_state THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.review_state = 'detected' AND NEW.review_state = 'suggested')
    OR (OLD.review_state = 'suggested' AND NEW.review_state IN ('waiting_confirmation', 'rejected'))
    OR (OLD.review_state = 'waiting_confirmation' AND NEW.review_state IN ('confirmed', 'rejected'))
  ) THEN
    RAISE EXCEPTION 'invalid_review_state_transition: % -> %', OLD.review_state, NEW.review_state
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_suggestions_review_transition ON public.financial_suggestions;
CREATE TRIGGER financial_suggestions_review_transition
  BEFORE UPDATE OF review_state ON public.financial_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.validate_financial_suggestion_review_transition();

-- ============================================================
-- C. Action Center extension
-- ============================================================
ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id UUID,
  ADD COLUMN IF NOT EXISTS review_state TEXT
    CHECK (review_state IS NULL OR review_state IN (
      'detected',
      'suggested',
      'waiting_confirmation',
      'confirmed',
      'rejected'
    )),
  ADD COLUMN IF NOT EXISTS suggestion_id UUID REFERENCES public.financial_suggestions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relation_id UUID REFERENCES public.entity_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS action_items_suggestion_idx
  ON public.action_items (organization_id, suggestion_id)
  WHERE suggestion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS action_items_review_state_idx
  ON public.action_items (organization_id, review_state)
  WHERE review_state IS NOT NULL;

DROP INDEX IF EXISTS public.action_items_dedupe_idx;
CREATE UNIQUE INDEX IF NOT EXISTS action_items_dedupe_idx
  ON public.action_items (
    organization_id,
    type,
    source_type,
    source_id,
    COALESCE(suggestion_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE deleted_at IS NULL;

-- ============================================================
-- D. Entity links 2.0 metadata columns and vocabulary
-- ============================================================
ALTER TABLE public.entity_links
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('suggested', 'waiting_confirmation', 'confirmed', 'rejected', 'unlinked')),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user'
    CHECK (source IN ('user', 'system', 'ai')),
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));

UPDATE public.entity_links
SET
  source = CASE
    WHEN metadata ->> 'source' = 'ai' THEN 'ai'
    WHEN metadata ->> 'source' IN ('auto', 'system') THEN 'system'
    ELSE 'user'
  END,
  confidence_score = CASE
    WHEN jsonb_typeof(metadata -> 'confidence') = 'number'
    THEN (metadata ->> 'confidence')::numeric
    ELSE confidence_score
  END
WHERE source = 'user'
  AND (metadata ? 'source' OR metadata ? 'confidence');

ALTER TABLE public.entity_links
  DROP CONSTRAINT IF EXISTS entity_links_link_type_check;

ALTER TABLE public.entity_links
  ADD CONSTRAINT entity_links_link_type_check
  CHECK (link_type IN (
    -- legacy + prior phases
    'related', 'generated_from', 'attached_to',
    'paid_by', 'renewed_by', 'requires_action', 'belongs_to',
    'related_to', 'documented_by', 'requires_action_task',
    'belongs_to_subscription', 'invoice_for_transaction',
    'contract_for_subscription', 'renewal_task',
    -- Phase C vocabulary
    'evidence_for', 'created_from', 'suggested_for', 'confirmed_as'
  ));

CREATE INDEX IF NOT EXISTS entity_links_status_idx
  ON public.entity_links (organization_id, status);
CREATE INDEX IF NOT EXISTS entity_links_source_confidence_idx
  ON public.entity_links (organization_id, source, confidence_score);

DROP POLICY IF EXISTS "entity_links_update" ON public.entity_links;
CREATE POLICY "entity_links_update"
  ON public.entity_links
  FOR UPDATE
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND deleted_at IS NULL
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

-- ============================================================
-- E. RLS
-- ============================================================
ALTER TABLE public.document_processing_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_processing_results_select" ON public.document_processing_results;
CREATE POLICY "document_processing_results_select"
  ON public.document_processing_results FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "document_processing_results_insert" ON public.document_processing_results;
CREATE POLICY "document_processing_results_insert"
  ON public.document_processing_results FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "document_processing_results_update" ON public.document_processing_results;
CREATE POLICY "document_processing_results_update"
  ON public.document_processing_results FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

DROP POLICY IF EXISTS "financial_suggestions_select" ON public.financial_suggestions;
CREATE POLICY "financial_suggestions_select"
  ON public.financial_suggestions FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "financial_suggestions_insert" ON public.financial_suggestions;
CREATE POLICY "financial_suggestions_insert"
  ON public.financial_suggestions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "financial_suggestions_update" ON public.financial_suggestions;
CREATE POLICY "financial_suggestions_update"
  ON public.financial_suggestions FOR UPDATE TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  )
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
  );

COMMIT;
