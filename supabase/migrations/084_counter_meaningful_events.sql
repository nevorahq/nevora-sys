-- ============================================================
-- Migration 084: counter counts only MEANINGFUL events
-- ============================================================
-- 083 made recent_actions count every unseen domain event. Some events are
-- internal lifecycle noise (extraction progress, categorization requests, the
-- Action Center's own item_created echo, planner processing steps) that the
-- visible Activity Log hides. This migration applies the SAME denylist to the
-- counter so the badge number matches what the user actually sees in the log.
--
-- Keep this list in sync with HIDDEN_EVENTS in
-- modules/action-center/queries/format-activity-event.ts.

BEGIN;

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
BEGIN
  IF v_user IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RETURN QUERY SELECT 0, 0, 0, 0, 0, 0, 0; RETURN;
  END IF;
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
    -- recent_actions: unseen MEANINGFUL domain events (noise excluded), capped 100.
    (SELECT count(*)::INTEGER FROM (
      SELECT 1 FROM public.domain_events de
      WHERE de.organization_id = p_organization_id
        AND de.created_at > v_since
        AND de.event_name NOT IN (
          'planner_entry.processing_started',
          'planner_entry.processed',
          'document.extraction.started',
          'document.extraction.completed',
          'document.extraction.failed',
          'money.transaction.categorization_requested',
          'money.transaction.auto_categorization_requested',
          'action_center.item_created'
        )
      LIMIT 100
    ) capped)
    FROM counts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_notification_counters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_counters(UUID) TO authenticated;

-- ============================================================
-- Realtime: let the client refresh the "Действия" badge instantly when a new
-- event lands, instead of waiting for the 60s poll. RLS still applies to what a
-- subscriber can read (domain_events_select = is_org_member).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'domain_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.domain_events;
  END IF;
END $$;

COMMIT;
