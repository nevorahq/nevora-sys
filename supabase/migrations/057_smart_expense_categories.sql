-- ============================================================
-- Migration 057: Smart expense categories (MVP foundation)
-- ============================================================
-- Separates the physical money account from the purpose/context of an
-- expense. Work contexts are organization-visible; Personal and Family are
-- private to their owner. Classification rules and decisions keep the
-- rule-first pipeline explainable and auditable.

-- ── 1. Expense contexts ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expense_contexts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id    UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  owner_user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL CHECK (slug IN ('personal', 'family', 'work')),
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  visibility      TEXT NOT NULL CHECK (visibility IN ('organization', 'private')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_context_visibility_owner_check CHECK (
    (visibility = 'organization' AND owner_user_id IS NULL)
    OR (visibility = 'private' AND owner_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_contexts_org_slug_unique
  ON public.expense_contexts (organization_id, slug)
  WHERE visibility = 'organization';

CREATE UNIQUE INDEX IF NOT EXISTS expense_contexts_private_slug_unique
  ON public.expense_contexts (organization_id, owner_user_id, slug)
  WHERE visibility = 'private';

CREATE INDEX IF NOT EXISTS expense_contexts_org_visibility_idx
  ON public.expense_contexts (organization_id, visibility, owner_user_id)
  WHERE is_active = true;

COMMENT ON TABLE public.expense_contexts IS
  'Purpose of an expense, independent from its physical money account. Work is organization-visible; Personal/Family are owner-private.';

-- Existing organizations receive the shared Work context. Personal and Family
-- are created lazily per user by the application because they require an owner.
INSERT INTO public.expense_contexts (organization_id, slug, name, visibility)
SELECT o.id, 'work', 'Work', 'organization'
FROM public.organizations o
ON CONFLICT DO NOTHING;

-- Stable system keys let the classifier target an allowlisted taxonomy while
-- keeping the user-facing category name editable/localizable.
ALTER TABLE public.money_categories
  ADD COLUMN IF NOT EXISTS system_key TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_categories' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.money_categories ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS money_categories_org_system_key_unique
  ON public.money_categories (organization_id, system_key)
  WHERE system_key IS NOT NULL AND is_active = true;

INSERT INTO public.money_categories
  (organization_id, name, type, is_default, is_active, system_key)
SELECT o.id, seed.name, 'expense', true, true, seed.system_key
FROM public.organizations o
CROSS JOIN (VALUES
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
  ('other',         'Other')
) AS seed(system_key, name)
ON CONFLICT DO NOTHING;

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
    ('other',         'Other')
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

-- ── 2. Transaction privacy + context ───────────────────────

ALTER TABLE public.money_transactions
  ADD COLUMN IF NOT EXISTS expense_context_id UUID REFERENCES public.expense_contexts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'organization'
    CHECK (visibility IN ('organization', 'private')),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.money_transactions
  DROP CONSTRAINT IF EXISTS money_transactions_visibility_owner_check;
ALTER TABLE public.money_transactions
  ADD CONSTRAINT money_transactions_visibility_owner_check CHECK (
    (visibility = 'organization' AND owner_user_id IS NULL)
    OR (visibility = 'private' AND owner_user_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS money_transactions_context_date_idx
  ON public.money_transactions (organization_id, expense_context_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS money_transactions_private_owner_idx
  ON public.money_transactions (organization_id, owner_user_id, transaction_date DESC)
  WHERE visibility = 'private' AND deleted_at IS NULL;

COMMENT ON COLUMN public.money_transactions.expense_context_id IS
  'Expense purpose/context. Independent from account_id, which remains the physical source of money.';
COMMENT ON COLUMN public.money_transactions.visibility IS
  'organization or private. Private rows are visible only to owner_user_id.';

-- ── 3. Rule-first classifier persistence ───────────────────

CREATE TABLE IF NOT EXISTS public.expense_classification_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id        UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  owner_user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility          TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('organization', 'private')),
  normalized_merchant TEXT NOT NULL CHECK (char_length(normalized_merchant) BETWEEN 1 AND 240),
  category_id         UUID REFERENCES public.money_categories(id) ON DELETE CASCADE,
  expense_context_id  UUID REFERENCES public.expense_contexts(id) ON DELETE CASCADE,
  source              TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'history', 'system')),
  priority            INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  confirmation_count  INTEGER NOT NULL DEFAULT 1 CHECK (confirmation_count >= 0),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expense_rule_has_result_check CHECK (
    category_id IS NOT NULL OR expense_context_id IS NOT NULL
  ),
  CONSTRAINT expense_rule_visibility_owner_check CHECK (
    (visibility = 'organization' AND owner_user_id IS NULL)
    OR (visibility = 'private' AND owner_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_rules_private_merchant_unique
  ON public.expense_classification_rules (organization_id, owner_user_id, normalized_merchant)
  WHERE visibility = 'private' AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS expense_rules_org_merchant_unique
  ON public.expense_classification_rules (organization_id, normalized_merchant)
  WHERE visibility = 'organization' AND is_active = true;

CREATE INDEX IF NOT EXISTS expense_rules_lookup_idx
  ON public.expense_classification_rules
    (organization_id, normalized_merchant, visibility, priority DESC)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.transaction_classifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id        UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  transaction_id      UUID NOT NULL REFERENCES public.money_transactions(id) ON DELETE CASCADE,
  owner_user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility          TEXT NOT NULL DEFAULT 'organization'
    CHECK (visibility IN ('organization', 'private')),
  category_id         UUID REFERENCES public.money_categories(id) ON DELETE SET NULL,
  expense_context_id  UUID REFERENCES public.expense_contexts(id) ON DELETE SET NULL,
  category_confidence NUMERIC(5, 4) CHECK (category_confidence BETWEEN 0 AND 1),
  context_confidence  NUMERIC(5, 4) CHECK (context_confidence BETWEEN 0 AND 1),
  method              TEXT NOT NULL
    CHECK (method IN ('user_rule', 'history', 'subscription', 'system_rule', 'ai', 'manual', 'unclassified')),
  reason              TEXT NOT NULL CHECK (char_length(reason) <= 1000),
  matched_signals     JSONB NOT NULL DEFAULT '[]',
  classifier_version  TEXT NOT NULL DEFAULT 'smart-categories-v1',
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transaction_classification_visibility_owner_check CHECK (
    (visibility = 'organization' AND owner_user_id IS NULL)
    OR (visibility = 'private' AND owner_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS transaction_classifications_tx_idx
  ON public.transaction_classifications (organization_id, transaction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS transaction_classifications_category_idx
  ON public.transaction_classifications (organization_id, category_id, created_at DESC);

COMMENT ON TABLE public.expense_classification_rules IS
  'Rule-first merchant classification. User corrections create private rules only after explicit opt-in.';
COMMENT ON TABLE public.transaction_classifications IS
  'Append-only provenance for automatic and manual expense classification decisions.';

-- ── 4. updated_at triggers ─────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at ON public.expense_contexts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.expense_contexts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.expense_classification_rules;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.expense_classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5. RLS ─────────────────────────────────────────────────

ALTER TABLE public.expense_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_classification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_contexts_select" ON public.expense_contexts
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  );

CREATE POLICY "expense_contexts_insert" ON public.expense_contexts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND visibility = 'private'
    AND owner_user_id = auth.uid()
    AND slug IN ('personal', 'family')
  );

CREATE POLICY "expense_contexts_update" ON public.expense_contexts
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id) AND owner_user_id = auth.uid())
  WITH CHECK (
    public.can_write_data(organization_id)
    AND visibility = 'private'
    AND owner_user_id = auth.uid()
  );

CREATE POLICY "expense_rules_select" ON public.expense_classification_rules
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  );

CREATE POLICY "expense_rules_insert" ON public.expense_classification_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND visibility = 'private'
    AND owner_user_id = auth.uid()
    AND (
      category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.money_categories c
        WHERE c.id = category_id
          AND c.organization_id = expense_classification_rules.organization_id
      )
    )
    AND (
      expense_context_id IS NULL OR EXISTS (
        SELECT 1 FROM public.expense_contexts ec
        WHERE ec.id = expense_context_id
          AND ec.organization_id = expense_classification_rules.organization_id
          AND (ec.visibility = 'organization' OR ec.owner_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "expense_rules_update" ON public.expense_classification_rules
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id) AND owner_user_id = auth.uid())
  WITH CHECK (
    public.can_write_data(organization_id)
    AND visibility = 'private'
    AND owner_user_id = auth.uid()
    AND (
      category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.money_categories c
        WHERE c.id = category_id
          AND c.organization_id = expense_classification_rules.organization_id
      )
    )
    AND (
      expense_context_id IS NULL OR EXISTS (
        SELECT 1 FROM public.expense_contexts ec
        WHERE ec.id = expense_context_id
          AND ec.organization_id = expense_classification_rules.organization_id
          AND (ec.visibility = 'organization' OR ec.owner_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "expense_rules_delete" ON public.expense_classification_rules
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id) AND owner_user_id = auth.uid());

CREATE POLICY "transaction_classifications_select" ON public.transaction_classifications
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  );

CREATE POLICY "transaction_classifications_insert" ON public.transaction_classifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND (
      (visibility = 'organization' AND owner_user_id IS NULL)
      OR (visibility = 'private' AND owner_user_id = auth.uid())
    )
    AND (
      category_id IS NULL OR EXISTS (
        SELECT 1 FROM public.money_categories c
        WHERE c.id = category_id
          AND c.organization_id = transaction_classifications.organization_id
      )
    )
    AND (
      expense_context_id IS NULL OR EXISTS (
        SELECT 1 FROM public.expense_contexts ec
        WHERE ec.id = expense_context_id
          AND ec.organization_id = transaction_classifications.organization_id
          AND (ec.visibility = 'organization' OR ec.owner_user_id = auth.uid())
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.money_transactions mt
      WHERE mt.id = transaction_id
        AND mt.organization_id = transaction_classifications.organization_id
        AND (mt.visibility = 'organization' OR mt.owner_user_id = auth.uid())
    )
  );

-- Decisions are an append-only audit trail from the authenticated app.

-- Tighten transaction visibility without changing the existing permission
-- model for organization-visible rows.
DROP POLICY IF EXISTS "money_transactions_org_select" ON public.money_transactions;
CREATE POLICY "money_transactions_org_select" ON public.money_transactions
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "money_transactions_org_insert" ON public.money_transactions;
CREATE POLICY "money_transactions_org_insert" ON public.money_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND (
      (visibility = 'organization' AND owner_user_id IS NULL)
      OR (visibility = 'private' AND owner_user_id = auth.uid())
    )
    AND (
      expense_context_id IS NULL OR EXISTS (
        SELECT 1 FROM public.expense_contexts ec
        WHERE ec.id = expense_context_id
          AND ec.organization_id = money_transactions.organization_id
          AND (ec.visibility = 'organization' OR ec.owner_user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "money_transactions_org_update" ON public.money_transactions;
CREATE POLICY "money_transactions_org_update" ON public.money_transactions
  FOR UPDATE TO authenticated
  USING (
    public.can_write_data(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  )
  WITH CHECK (
    public.can_write_data(organization_id)
    AND (
      (visibility = 'organization' AND owner_user_id IS NULL)
      OR (visibility = 'private' AND owner_user_id = auth.uid())
    )
    AND (
      expense_context_id IS NULL OR EXISTS (
        SELECT 1 FROM public.expense_contexts ec
        WHERE ec.id = expense_context_id
          AND ec.organization_id = money_transactions.organization_id
          AND (ec.visibility = 'organization' OR ec.owner_user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "money_transactions_org_delete" ON public.money_transactions;
CREATE POLICY "money_transactions_org_delete" ON public.money_transactions
  FOR DELETE TO authenticated
  USING (
    public.can_delete_data(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  );
