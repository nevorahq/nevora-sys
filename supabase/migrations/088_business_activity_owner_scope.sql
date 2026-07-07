-- ============================================================
-- Migration 088: Business Activity — owner/admin see all, member sees own
-- ============================================================
-- Refines the visibility split from 087. Under 087, business events were
-- org-wide (every member saw every member's business activity). The product
-- model is: "Owner видит бизнес-аудит организации, member — свои действия."
--
-- New rule for domain_events SELECT:
--   business  → owner/admin see ALL; a member sees only rows they authored.
--   personal  → only the actor (unchanged).
--   security  → owner/admin only (unchanged).
--   system    → nobody via user RLS (unchanged).
--
-- Owner/Admin retain the full organization business audit; a member's Activity
-- Log now shows only their own contributions plus their own personal activity.
-- ============================================================

BEGIN;

-- Index that matches the member's own-business read path.
CREATE INDEX IF NOT EXISTS domain_events_org_creator_activity_idx
  ON public.domain_events (organization_id, created_by, activity_type, created_at DESC);

DROP POLICY IF EXISTS "domain_events_select" ON public.domain_events;
CREATE POLICY "domain_events_select"
  ON public.domain_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      -- business: full org audit for owner/admin; own contributions for members
      (activity_type = 'business'
        AND (public.is_org_admin(organization_id) OR created_by = auth.uid()))
      -- personal: only the actor
      OR (activity_type = 'personal' AND created_by = auth.uid())
      -- security: owner/admin only
      OR (activity_type = 'security' AND public.is_org_admin(organization_id))
      -- system: never exposed via user RLS
    )
  );


-- ============================================================
-- Notification counter — mirror the new business scope
-- ============================================================
-- recent_actions must count the same rows the Activity Log shows: business for
-- owner/admin (all) or for a member (own), plus security for owner/admin.
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
    -- recent_actions: unseen VISIBLE events — business (all for admin, own for member) + security for admin.
    (SELECT count(*)::INTEGER FROM (
      SELECT 1 FROM public.domain_events de
      WHERE de.organization_id = p_organization_id
        AND de.created_at > v_since
        AND (
          (de.activity_type = 'business' AND (v_is_admin OR de.created_by = v_user))
          OR (de.activity_type = 'security' AND v_is_admin)
        )
      LIMIT 100
    ) capped)
    FROM counts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_notification_counters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_counters(UUID) TO authenticated;

COMMIT;
