-- ============================================================
-- Migration 087: Data Isolation & Activity Visibility
-- ============================================================
-- Target model (see docs): every activity signal is one of four classes.
--
--   business  → org records: task.created, document.created, money.*.confirmed,
--               subscription.created. Visible to all active members.
--   personal  → the actor's own quiet activity: capture inbox, AI suggestions,
--               dismissed recommendations. Visible ONLY to created_by.
--   security  → audit trail: member.invited / role_changed / removed, billing.*,
--               org/workspace structural changes. Visible ONLY to owner/admin.
--   system    → background jobs: OCR extraction, categorization requests, the
--               Action Center's own item echo. Never surfaced in the user UI.
--
-- Before this migration domain_events had a single SELECT policy
-- (is_org_member) — every member could read the whole org event stream,
-- leaking other members' personal activity AND the security audit. This
-- migration classifies each event and splits the read policy accordingly.
--
-- It also closes the capture-inbox leak: planner_entries / planner_suggestions
-- were org-readable (is_org_member), so any member could read another member's
-- private captures and AI suggestions. They become owner-scoped (mirrors the
-- money visibility model from migrations 057 / 069).
--
-- RLS is the source of truth here; the UI split and the counter predicate below
-- only mirror what the database already enforces.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Classification — single source of truth (event_name → class)
-- ============================================================
-- IMMUTABLE so it can be used in a trigger, the backfill, and stays cacheable.
-- Keep in sync with modules/action-center/queries/activity-classification.ts.

CREATE OR REPLACE FUNCTION public.domain_event_activity_type(p_event_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE
    -- personal: the actor's own quiet activity
    WHEN p_event_name LIKE 'planner_entry.%'
      OR p_event_name LIKE 'planner_suggestion.%'
      OR p_event_name LIKE 'money.ai_suggestion.%'
      OR p_event_name = 'recommendation.dismissed'
      THEN 'personal'
    -- security: audit trail — owner/admin only
    WHEN p_event_name LIKE 'member.%'
      OR p_event_name LIKE 'billing.%'
      OR p_event_name IN ('org.created', 'org.updated', 'workspace.created')
      THEN 'security'
    -- system: background jobs — never in the user UI
    WHEN p_event_name LIKE 'document.extraction.%'
      OR p_event_name = 'document.financial_data_extracted'
      OR p_event_name IN (
        'money.transaction.categorization_requested',
        'money.transaction.auto_categorization_requested',
        'action_center.item_created'
      )
      THEN 'system'
    -- everything else is org business activity
    ELSE 'business'
  END;
$$;

COMMENT ON FUNCTION public.domain_event_activity_type(TEXT) IS
  'Maps a domain event name to its activity class: business | personal | security | system.';

CREATE OR REPLACE FUNCTION public.domain_event_visibility(p_event_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE public.domain_event_activity_type(p_event_name)
    WHEN 'personal' THEN 'private'
    WHEN 'system'   THEN 'system'
    ELSE 'organization'
  END;
$$;

COMMENT ON FUNCTION public.domain_event_visibility(TEXT) IS
  'Derives the visibility scope (organization | private | system) from an event name.';


-- ============================================================
-- 2. Columns on domain_events
-- ============================================================
ALTER TABLE public.domain_events
  ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'business'
    CHECK (activity_type IN ('business', 'personal', 'security', 'system')),
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'organization'
    CHECK (visibility IN ('organization', 'private', 'system'));

COMMENT ON COLUMN public.domain_events.activity_type IS
  'Set by trigger from event_name. Drives the split SELECT policy. Never client-settable.';


-- ============================================================
-- 3. Trigger — classify on insert (spoof-proof: always overwrites)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_domain_event_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.activity_type := public.domain_event_activity_type(NEW.event_name);
  NEW.visibility    := public.domain_event_visibility(NEW.event_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_domain_events_classify ON public.domain_events;
CREATE TRIGGER trg_domain_events_classify
  BEFORE INSERT ON public.domain_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_domain_event_classification();


-- ============================================================
-- 4. Backfill existing rows
-- ============================================================
UPDATE public.domain_events
  SET activity_type = public.domain_event_activity_type(event_name),
      visibility    = public.domain_event_visibility(event_name)
  WHERE activity_type = 'business'  -- default; re-classify everything once
     OR visibility = 'organization';

-- Belt-and-suspenders: ensure nothing was missed (idempotent).
UPDATE public.domain_events
  SET activity_type = public.domain_event_activity_type(event_name),
      visibility    = public.domain_event_visibility(event_name)
  WHERE activity_type <> public.domain_event_activity_type(event_name)
     OR visibility <> public.domain_event_visibility(event_name);


-- ============================================================
-- 5. Index for the per-class reads (Activity Log, counter)
-- ============================================================
CREATE INDEX IF NOT EXISTS domain_events_org_activity_created_idx
  ON public.domain_events (organization_id, activity_type, created_at DESC);


-- ============================================================
-- 6. Split SELECT policy on domain_events
-- ============================================================
-- business → any member; personal → only the actor; security → owner/admin;
-- system   → no user can read (service role bypasses RLS for background jobs).
DROP POLICY IF EXISTS "domain_events_select" ON public.domain_events;
CREATE POLICY "domain_events_select"
  ON public.domain_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      activity_type = 'business'
      OR (activity_type = 'personal' AND created_by = auth.uid())
      OR (activity_type = 'security' AND public.is_org_admin(organization_id))
    )
  );
-- INSERT policy (created_by = auth.uid()) is unchanged; UPDATE/DELETE stay denied.


-- ============================================================
-- 7. Notification counter — mirror the visibility split
-- ============================================================
-- get_notification_counters is SECURITY DEFINER (bypasses RLS), so it must apply
-- the same predicate by hand. recent_actions now counts business events for
-- everyone plus security events for owner/admin; personal and system never
-- inflate the badge. This replaces the old event_name denylist from 084.
DROP FUNCTION IF EXISTS public.get_notification_counters(UUID);

CREATE FUNCTION public.get_notification_counters(p_organization_id UUID)
RETURNS TABLE(
  unread INTEGER,
  attention INTEGER,
  upcoming INTEGER,
  due_today INTEGER,
  overdue INTEGER,
  urgent INTEGER,
  recent_actions INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_user UUID := auth.uid();
  v_tz TEXT;
  v_today DATE;
  v_since TIMESTAMPTZ;
  v_is_admin BOOLEAN;
BEGIN
  IF v_user IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RETURN QUERY SELECT 0, 0, 0, 0, 0, 0, 0; RETURN;
  END IF;
  v_is_admin := public.is_org_admin(p_organization_id);

  SELECT COALESCE(p.timezone, o.timezone, 'UTC') INTO v_tz FROM public.organizations o
  LEFT JOIN public.user_notification_preferences p ON p.organization_id = o.id AND p.user_id = v_user
  WHERE o.id = p_organization_id;
  v_today := (now() AT TIME ZONE v_tz)::date;

  SELECT last_seen_at INTO v_since FROM public.action_center_seen
    WHERE organization_id = p_organization_id AND user_id = v_user;
  v_since := COALESCE(v_since, now() - interval '1 hour');

  RETURN QUERY WITH obligations AS (
    SELECT t.due_date AS due_date FROM public.todos t WHERE t.organization_id = p_organization_id
      AND t.deleted_at IS NULL AND t.status <> 'done' AND t.due_date IS NOT NULL AND public.can_access_task(t.id)
    UNION ALL SELECT s.next_billing_date FROM public.subscriptions s WHERE s.organization_id = p_organization_id
      AND s.created_by = v_user AND s.is_active
    UNION ALL SELECT x.transaction_date FROM public.money_transactions x WHERE x.organization_id = p_organization_id
      AND x.created_by = v_user AND x.status = 'planned' AND x.deleted_at IS NULL
  ), counts AS (
    SELECT count(*) FILTER (WHERE due_date > v_today AND due_date <= v_today + 7)::INTEGER AS upcoming,
      count(*) FILTER (WHERE due_date = v_today)::INTEGER AS due_today,
      count(*) FILTER (WHERE due_date < v_today)::INTEGER AS overdue FROM obligations
  ) SELECT
    (SELECT count(*)::INTEGER FROM public.notifications n WHERE n.organization_id = p_organization_id AND n.user_id = v_user AND n.read_at IS NULL),
    (SELECT count(*)::INTEGER FROM public.action_items ai WHERE ai.organization_id = p_organization_id AND ai.deleted_at IS NULL
      AND ai.status IN ('open', 'in_progress', 'failed') AND (ai.assigned_to IS NULL OR ai.assigned_to = v_user)),
    counts.upcoming, counts.due_today, counts.overdue, (counts.due_today + counts.overdue)::INTEGER,
    -- recent_actions: unseen VISIBLE events only — business for all, security for admins.
    (SELECT count(*)::INTEGER FROM (
      SELECT 1 FROM public.domain_events de
      WHERE de.organization_id = p_organization_id
        AND de.created_at > v_since
        AND (
          de.activity_type = 'business'
          OR (de.activity_type = 'security' AND v_is_admin)
        )
      LIMIT 100
    ) capped)
    FROM counts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_notification_counters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_counters(UUID) TO authenticated;


-- ============================================================
-- 8. Capture Inbox — owner-scoped visibility
-- ============================================================
-- planner_entries / planner_suggestions are a private personal surface. Add the
-- ownership + visibility columns (mirrors money's owner_user_id / visibility) and
-- scope every policy to the owner. Existing rows are owned by their creator.

ALTER TABLE public.planner_entries
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'organization'));

ALTER TABLE public.planner_suggestions
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'organization'));

UPDATE public.planner_entries    SET owner_user_id = created_by WHERE owner_user_id IS NULL;
UPDATE public.planner_suggestions SET owner_user_id = created_by WHERE owner_user_id IS NULL;

ALTER TABLE public.planner_entries    ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE public.planner_suggestions ALTER COLUMN owner_user_id SET NOT NULL;

-- New rows default the owner to the acting user (server also sets it explicitly).
ALTER TABLE public.planner_entries    ALTER COLUMN owner_user_id SET DEFAULT auth.uid();
ALTER TABLE public.planner_suggestions ALTER COLUMN owner_user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS planner_entries_owner_idx
  ON public.planner_entries (organization_id, owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS planner_suggestions_owner_idx
  ON public.planner_suggestions (organization_id, owner_user_id, created_at DESC);

-- ── planner_entries policies ────────────────────────────────────────────────
DROP POLICY IF EXISTS "planner_entries_select" ON public.planner_entries;
CREATE POLICY "planner_entries_select"
  ON public.planner_entries FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "planner_entries_insert" ON public.planner_entries;
CREATE POLICY "planner_entries_insert"
  ON public.planner_entries FOR INSERT
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "planner_entries_update" ON public.planner_entries;
CREATE POLICY "planner_entries_update"
  ON public.planner_entries FOR UPDATE
  USING (public.is_org_member(organization_id) AND owner_user_id = auth.uid())
  WITH CHECK (public.is_org_member(organization_id) AND owner_user_id = auth.uid());

DROP POLICY IF EXISTS "planner_entries_delete" ON public.planner_entries;
CREATE POLICY "planner_entries_delete"
  ON public.planner_entries FOR DELETE
  USING (public.is_org_member(organization_id) AND owner_user_id = auth.uid());

-- ── planner_suggestions policies ────────────────────────────────────────────
DROP POLICY IF EXISTS "planner_suggestions_select" ON public.planner_suggestions;
CREATE POLICY "planner_suggestions_select"
  ON public.planner_suggestions FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND (visibility = 'organization' OR owner_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "planner_suggestions_insert" ON public.planner_suggestions;
CREATE POLICY "planner_suggestions_insert"
  ON public.planner_suggestions FOR INSERT
  WITH CHECK (
    public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "planner_suggestions_update" ON public.planner_suggestions;
CREATE POLICY "planner_suggestions_update"
  ON public.planner_suggestions FOR UPDATE
  USING (public.is_org_member(organization_id) AND owner_user_id = auth.uid())
  WITH CHECK (public.is_org_member(organization_id) AND owner_user_id = auth.uid());

DROP POLICY IF EXISTS "planner_suggestions_delete" ON public.planner_suggestions;
CREATE POLICY "planner_suggestions_delete"
  ON public.planner_suggestions FOR DELETE
  USING (public.is_org_member(organization_id) AND owner_user_id = auth.uid());

COMMIT;

-- ============================================================
-- VERIFICATION (see supabase/tests/data_isolation_visibility_verification.sql)
-- ============================================================
-- SELECT event_name, activity_type, visibility FROM public.domain_events
--   ORDER BY created_at DESC LIMIT 20;
-- SELECT DISTINCT activity_type FROM public.domain_events;  -- expect 4 classes
-- ============================================================
