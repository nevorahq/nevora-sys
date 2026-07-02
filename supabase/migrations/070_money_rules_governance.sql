-- ============================================================
-- Migration 070: Money category rules governance (Phase 5.1)
-- ============================================================
-- expense_classification_rules (057) already models both scopes through
-- `visibility` ('private' | 'organization') with the matching constraint and
-- unique indexes — no schema change is needed. What 057 intentionally locked
-- down was WRITE access: only private rules could be created/updated/deleted.
--
-- Phase 5.1 opens an admin-gated path for organization-wide rules:
--   • private rules   — unchanged: any member with write access, own rows only
--   • org-wide rules  — owner/admin only (public.is_org_admin), because one
--     org rule silently categorizes FUTURE transactions for every member.
--     Historical transactions are never reclassified (the pipeline only runs
--     on-create / on-demand).
--
-- SELECT policy stays as-is (members see org rules + their own private ones).

DROP POLICY IF EXISTS "expense_rules_insert" ON public.expense_classification_rules;
CREATE POLICY "expense_rules_insert" ON public.expense_classification_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND (
      (visibility = 'private' AND owner_user_id = auth.uid())
      OR (
        visibility = 'organization'
        AND owner_user_id IS NULL
        AND public.is_org_admin(organization_id)
      )
    )
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

DROP POLICY IF EXISTS "expense_rules_update" ON public.expense_classification_rules;
CREATE POLICY "expense_rules_update" ON public.expense_classification_rules
  FOR UPDATE TO authenticated
  USING (
    public.can_write_data(organization_id)
    AND (
      (visibility = 'private' AND owner_user_id = auth.uid())
      OR (visibility = 'organization' AND public.is_org_admin(organization_id))
    )
  )
  WITH CHECK (
    public.can_write_data(organization_id)
    AND (
      (visibility = 'private' AND owner_user_id = auth.uid())
      OR (
        visibility = 'organization'
        AND owner_user_id IS NULL
        AND public.is_org_admin(organization_id)
      )
    )
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

DROP POLICY IF EXISTS "expense_rules_delete" ON public.expense_classification_rules;
CREATE POLICY "expense_rules_delete" ON public.expense_classification_rules
  FOR DELETE TO authenticated
  USING (
    public.can_delete_data(organization_id)
    AND (
      (visibility = 'private' AND owner_user_id = auth.uid())
      OR (visibility = 'organization' AND public.is_org_admin(organization_id))
    )
  );

-- Suggestions sweep (Phase 5.1 §4.4) needs an efficient "stale pending" scan
-- across tenants. Partial index keeps it cheap regardless of table growth.
CREATE INDEX IF NOT EXISTS money_ai_suggestions_pending_created_idx
  ON public.money_ai_suggestions (created_at)
  WHERE status = 'pending';
