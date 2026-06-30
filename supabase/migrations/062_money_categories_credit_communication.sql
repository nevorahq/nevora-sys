-- ============================================================
-- Migration 062: Add "Credit" + "Communications" categories, retire foods/auto/test
-- ============================================================
-- Money categories live in public.money_categories (per organization).
-- The "Add Transaction" form lists rows WHERE is_active = true; the ledger
-- joins money_categories(name) by category_id WITHOUT an is_active filter,
-- so deactivating a category hides it from new selections while existing
-- transactions keep rendering their original category name.
--
-- This migration is purely data + seed-function maintenance. It follows the
-- slug-based taxonomy introduced in 057: a stable system_key (technical id)
-- plus an editable, human-readable name.
--
--   credit         → "Credit"
--   communications → "Communications"
--
-- Nothing is physically deleted. foods/auto/test are flagged is_active = false.

-- ── 1. Seed the two new categories into existing organizations ──
-- type = 'expense' to match the existing organization-visible taxonomy
-- (Food, Transport, …). is_default = true marks them as system categories.
-- Guarded by NOT EXISTS on (organization_id, system_key) so re-runs are no-ops
-- and we never create a duplicate row for the same slug.

INSERT INTO public.money_categories
  (organization_id, name, type, is_default, is_active, system_key)
SELECT o.id, seed.name, 'expense', true, true, seed.system_key
FROM public.organizations o
CROSS JOIN (VALUES
  ('credit',         'Credit'),
  ('communications', 'Communications')
) AS seed(system_key, name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.money_categories mc
  WHERE mc.organization_id = o.id
    AND mc.system_key = seed.system_key
);

-- If a slug existed but was previously deactivated, make sure it is selectable.
UPDATE public.money_categories
SET is_active = true
WHERE system_key IN ('credit', 'communications')
  AND is_active = false;

-- ── 2. Retire legacy foods / auto / test from the selectable list ──
-- Match only these exact names (case-insensitive), so the seeded singular
-- "Food" category is NOT affected. Soft-deactivate only — old transactions
-- referencing these categories continue to display correctly.

UPDATE public.money_categories
SET is_active = false
WHERE is_active = true
  AND lower(btrim(name)) IN ('foods', 'auto', 'test');

-- ── 3. Teach the per-org seed function to include the new categories ──
-- ensure_expense_contexts() seeds the system taxonomy for organizations as
-- they are touched by the app, so brand-new orgs also get Credit + Communications.
-- (Function body copied from 057 with the two extra seed rows appended.)

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
