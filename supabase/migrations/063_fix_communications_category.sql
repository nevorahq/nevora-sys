-- ============================================================
-- Migration 063: Reconcile "Communications" category (fixes 062)
-- ============================================================
-- Migration 062 was first applied with the legacy slug/label
-- ('communication' → "Связь") before it was corrected in the file. Because
-- Supabase tracks migrations by version, the corrected 062 never re-ran on
-- environments that already had it — leaving "Связь" visible and
-- "Communications" missing.
--
-- This migration converges any environment to the intended end state,
-- regardless of whether it currently holds the legacy row, the new row, both,
-- or neither. It is idempotent and never deletes data.
--
--   final slug  = 'communications'
--   final label = 'Communications'

-- ── 1. Drop the legacy row only where a correct one already coexists ──
-- Avoids violating money_categories_org_system_key_unique (partial index over
-- active rows) when an org somehow has both slugs active.
UPDATE public.money_categories legacy
SET is_active = false
WHERE legacy.system_key = 'communication'
  AND legacy.is_active = true
  AND EXISTS (
    SELECT 1 FROM public.money_categories fixed
    WHERE fixed.organization_id = legacy.organization_id
      AND fixed.system_key = 'communications'
      AND fixed.is_active = true
  );

-- ── 2. Rename the remaining legacy rows in place ──
-- Preserves the row id (and any FK references from transactions/rules) while
-- flipping both the technical slug and the display label.
UPDATE public.money_categories
SET system_key = 'communications',
    name = 'Communications'
WHERE system_key = 'communication';

-- ── 3. Backfill organizations that still have no Communications category ──
INSERT INTO public.money_categories
  (organization_id, name, type, is_default, is_active, system_key)
SELECT o.id, 'Communications', 'expense', true, true, 'communications'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.money_categories mc
  WHERE mc.organization_id = o.id
    AND mc.system_key = 'communications'
);

-- ── 4. Ensure the Communications category is selectable ──
UPDATE public.money_categories
SET is_active = true
WHERE system_key = 'communications'
  AND is_active = false;

-- ── 5. Safety net: retire any leftover category still named "Связь" ──
UPDATE public.money_categories
SET is_active = false
WHERE is_active = true
  AND lower(btrim(name)) = 'связь'
  AND system_key IS DISTINCT FROM 'communications';

-- ── 6. Re-define the per-org seed function with the corrected slug/label ──
-- The function body persisted by the first 062 run still seeds the legacy
-- 'communication' → "Связь"; redefine it so new organizations get the right one.
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
    ('food',           'Food'),
    ('transport',      'Transport'),
    ('software',       'Software / SaaS'),
    ('office',         'Office expenses'),
    ('taxes',          'Taxes & fees'),
    ('health',         'Health'),
    ('home',           'Home'),
    ('marketing',      'Marketing'),
    ('travel',         'Travel'),
    ('subscriptions',  'Subscriptions'),
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
