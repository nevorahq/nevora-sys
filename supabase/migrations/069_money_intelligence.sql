-- ============================================================
-- Migration 069: Money Intelligence & AI Categorization (Phase 5)
-- ============================================================
-- Builds on the existing foundation instead of duplicating it:
--   • money_categories (000/004/057/062)   — org-scoped taxonomy with system_key
--   • expense_classification_rules (057)   — user merchant rules ("category rules")
--   • transaction_classifications (057)    — append-only decision provenance
--   • document_extractions/… (051)         — document AI pipeline
--
-- This migration adds ONLY the missing Phase 5 pieces:
--   1. Categorization state on money_transactions
--   2. money_ai_suggestions — reviewable category suggestions for transactions
--      (AI/history/system suggestions never mutate the transaction directly;
--       the user accepts / edits / rejects them explicitly)
--   3. Income category seeds (taxonomy previously covered expenses only)
--   4. ai_requests.action_type += 'transaction_categorization' (quota ledger)

-- ── 1. Categorization state on money_transactions ───────────

ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS categorization_status TEXT NOT NULL DEFAULT 'uncategorized'
    CHECK (categorization_status IN ('uncategorized', 'processing', 'suggested', 'confirmed', 'failed')),
  ADD COLUMN IF NOT EXISTS category_source TEXT
    CHECK (category_source IN ('manual', 'rule', 'history', 'system', 'ai', 'import')),
  ADD COLUMN IF NOT EXISTS category_confidence NUMERIC(5, 4)
    CHECK (category_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS normalized_merchant_name TEXT;

COMMENT ON COLUMN public.money_transactions.categorization_status IS
  'uncategorized | processing | suggested | confirmed | failed. Only income/expense rows participate; transfers carry no category.';
COMMENT ON COLUMN public.money_transactions.category_source IS
  'Who assigned category_id: manual | rule | history | system | ai | import. NULL while uncategorized.';
COMMENT ON COLUMN public.money_transactions.normalized_merchant_name IS
  'Lowercased/stripped merchant key for rule + history matching. Written by the app (normalizeMerchantName).';

-- Backfill: rows that already carry a category were chosen by a person
-- (manual form select or an explicitly confirmed document draft).
UPDATE public.money_transactions
SET categorization_status = 'confirmed',
    category_source = COALESCE(category_source, 'manual')
WHERE category_id IS NOT NULL
  AND categorization_status = 'uncategorized';

-- Approximate SQL normalization for history matching on legacy rows.
-- New rows are normalized in the app; a slight mismatch here only makes
-- the history step skip a legacy row, never misclassify.
UPDATE public.money_transactions
SET normalized_merchant_name = NULLIF(
  btrim(regexp_replace(
    regexp_replace(lower(COALESCE(merchant_name, title)), '[^a-z0-9а-яё\s]', ' ', 'g'),
    '\s+', ' ', 'g'
  )), '')
WHERE normalized_merchant_name IS NULL
  AND type IN ('income', 'expense');

CREATE INDEX IF NOT EXISTS money_transactions_categorization_idx
  ON public.money_transactions (organization_id, categorization_status, transaction_date DESC)
  WHERE deleted_at IS NULL AND status = 'posted';

CREATE INDEX IF NOT EXISTS money_transactions_normalized_merchant_idx
  ON public.money_transactions (organization_id, normalized_merchant_name)
  WHERE deleted_at IS NULL AND status = 'posted' AND normalized_merchant_name IS NOT NULL;

-- ── 2. money_ai_suggestions ─────────────────────────────────
-- A reviewable suggestion is separate from the transaction: nothing is
-- applied until the user accepts (or edits) it.

CREATE TABLE IF NOT EXISTS public.money_ai_suggestions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id             UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  transaction_id           UUID NOT NULL REFERENCES public.money_transactions(id) ON DELETE CASCADE,

  suggested_category_id    UUID REFERENCES public.money_categories(id) ON DELETE SET NULL,
  suggested_category_name  TEXT,
  suggested_type           TEXT CHECK (suggested_type IN ('income', 'expense')),

  merchant_name            TEXT,
  normalized_merchant_name TEXT,

  confidence               NUMERIC(5, 4) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  reasoning                TEXT CHECK (char_length(reasoning) <= 1000),
  tags                     TEXT[] NOT NULL DEFAULT '{}',
  source                   TEXT NOT NULL CHECK (source IN ('history', 'system', 'ai')),

  -- Compact, non-sensitive model I/O for debugging/calibration.
  raw_input                JSONB NOT NULL DEFAULT '{}',
  raw_output               JSONB NOT NULL DEFAULT '{}',

  status                   TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'edited', 'rejected', 'expired')),

  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.money_ai_suggestions IS
  'Reviewable category suggestions (history/system/AI) for money transactions. Applied to the transaction only on explicit accept/edit.';

-- At most one pending suggestion per transaction; a re-run expires the old one.
CREATE UNIQUE INDEX IF NOT EXISTS money_ai_suggestions_one_pending_idx
  ON public.money_ai_suggestions (transaction_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS money_ai_suggestions_org_status_idx
  ON public.money_ai_suggestions (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS money_ai_suggestions_transaction_idx
  ON public.money_ai_suggestions (transaction_id);

ALTER TABLE public.money_ai_suggestions ENABLE ROW LEVEL SECURITY;

-- Suggestions inherit transaction visibility: members see org-visible ones;
-- private transactions expose their suggestions to the owner only.
DROP POLICY IF EXISTS "money_ai_suggestions_select" ON public.money_ai_suggestions;
CREATE POLICY "money_ai_suggestions_select" ON public.money_ai_suggestions
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.money_transactions mt
      WHERE mt.id = transaction_id
        AND mt.organization_id = money_ai_suggestions.organization_id
        AND (mt.visibility = 'organization' OR mt.owner_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "money_ai_suggestions_insert" ON public.money_ai_suggestions;
CREATE POLICY "money_ai_suggestions_insert" ON public.money_ai_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.money_transactions mt
      WHERE mt.id = transaction_id
        AND mt.organization_id = money_ai_suggestions.organization_id
        AND (mt.visibility = 'organization' OR mt.owner_user_id = auth.uid())
    )
    AND (
      suggested_category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.money_categories c
        WHERE c.id = suggested_category_id
          AND c.organization_id = money_ai_suggestions.organization_id
      )
    )
  );

-- Review transitions only (accept/edit/reject/expire). Immutable core fields
-- are protected by the whitelisted app updates; the policy pins org + tx.
DROP POLICY IF EXISTS "money_ai_suggestions_update" ON public.money_ai_suggestions;
CREATE POLICY "money_ai_suggestions_update" ON public.money_ai_suggestions
  FOR UPDATE TO authenticated
  USING (
    public.can_write_data(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.money_transactions mt
      WHERE mt.id = transaction_id
        AND mt.organization_id = money_ai_suggestions.organization_id
        AND (mt.visibility = 'organization' OR mt.owner_user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.can_write_data(organization_id)
    AND (reviewed_by IS NULL OR reviewed_by = auth.uid())
  );

-- No DELETE policy: suggestions are an auditable trail (rejected/expired stay).

-- ── 3. Income category seeds ────────────────────────────────
-- The 057/062 taxonomy seeded expenses only. Income transactions need their
-- own selectable categories for categorization + analytics.

INSERT INTO public.money_categories
  (organization_id, name, type, is_default, is_active, system_key)
SELECT o.id, seed.name, 'income', true, true, seed.system_key
FROM public.organizations o
CROSS JOIN (VALUES
  ('client_revenue', 'Client Revenue'),
  ('product_sales',  'Product Sales'),
  ('refunds',        'Refunds'),
  ('other_income',   'Other Income')
) AS seed(system_key, name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.money_categories mc
  WHERE mc.organization_id = o.id
    AND mc.system_key = seed.system_key
);

-- Teach the per-org seed function (062 body + income block) so brand-new
-- organizations also receive income categories.
CREATE OR REPLACE FUNCTION public.ensure_expense_contexts(
  p_organization_id UUID,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS SETOF public.expense_contexts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.expense_contexts
    (organization_id, workspace_id, slug, name, visibility)
  VALUES
    (p_organization_id, p_workspace_id, 'work', 'Work', 'organization')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.expense_contexts
    (organization_id, workspace_id, owner_user_id, slug, name, visibility, created_by)
  VALUES
    (p_organization_id, p_workspace_id, auth.uid(), 'personal', 'Personal', 'private', auth.uid()),
    (p_organization_id, p_workspace_id, auth.uid(), 'family', 'Family', 'private', auth.uid())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.money_categories
    (organization_id, name, type, is_default, is_active, system_key, created_by, updated_by)
  SELECT p_organization_id, seed.name, 'expense', true, true, seed.system_key, auth.uid(), auth.uid()
  FROM (VALUES
    ('food',          'Food'),
    ('transport',     'Transport'),
    ('software',      'Software / SaaS'),
    ('office',        'Office expenses'),
    ('taxes',         'Taxes & fees'),
    ('health',        'Health'),
    ('home',          'Home'),
    ('marketing',     'Marketing'),
    ('travel',        'Travel'),
    ('subscriptions', 'Subscriptions'),
    ('credit',         'Credit'),
    ('communications', 'Communications'),
    ('other',          'Other')
  ) AS seed(system_key, name)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.money_categories
    (organization_id, name, type, is_default, is_active, system_key, created_by, updated_by)
  SELECT p_organization_id, seed.name, 'income', true, true, seed.system_key, auth.uid(), auth.uid()
  FROM (VALUES
    ('client_revenue', 'Client Revenue'),
    ('product_sales',  'Product Sales'),
    ('refunds',        'Refunds'),
    ('other_income',   'Other Income')
  ) AS seed(system_key, name)
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT c.*
  FROM public.expense_contexts c
  WHERE c.organization_id = p_organization_id
    AND c.is_active = true
    AND (c.visibility = 'organization' OR c.owner_user_id = auth.uid())
  ORDER BY CASE c.slug WHEN 'work' THEN 1 WHEN 'personal' THEN 2 ELSE 3 END;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_expense_contexts(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_expense_contexts(UUID, UUID) TO authenticated;

-- ── 4. AI quota ledger: allow 'transaction_categorization' ──
-- Same monthly ai_calls quota as summary/insights/document extraction (052).

ALTER TABLE public.ai_requests
  DROP CONSTRAINT IF EXISTS ai_requests_action_type_check;

ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_action_type_check
  CHECK (action_type IN ('summary', 'insights', 'recommendations', 'document_extraction', 'transaction_categorization'));
