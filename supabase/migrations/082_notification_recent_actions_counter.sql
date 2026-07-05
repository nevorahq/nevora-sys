-- ============================================================
-- Migration 082: "Recent actions" counter for the sidebar
-- ============================================================
-- Adds a `recent_actions` counter to get_notification_counters so the sidebar
-- "Действия" (Action Center) item can show a live badge that behaves like a log
-- of recent action activity: how many action items were recently ADDED to or
-- COMPLETED in the Action Center within a rolling window.
--
-- Every meaningful cross-module action surfaces as an action_item — a task goes
-- overdue / needs an assignee, a task is deleted (deletion marker), a
-- subscription renewal is due, an Inbox suggestion needs review, etc. Counting
-- action items whose latest activity (created / resolved / dismissed) falls in
-- the last 7 days gives a single "recent actions" number consistent with what
-- the /dashboard/actions page shows.
--
-- Return-type change (extra column) requires DROP + CREATE (CREATE OR REPLACE
-- cannot alter a RETURNS TABLE signature). Existing columns and all prior logic
-- are preserved verbatim; only `recent_actions` is appended. The app reads the
-- row by key, so appending a column is backward compatible.

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
DECLARE v_user UUID := auth.uid(); v_tz TEXT; v_today DATE;
BEGIN
  IF v_user IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RETURN QUERY SELECT 0, 0, 0, 0, 0, 0, 0; RETURN;
  END IF;
  SELECT COALESCE(p.timezone, o.timezone, 'UTC') INTO v_tz FROM public.organizations o
  LEFT JOIN public.user_notification_preferences p ON p.organization_id = o.id AND p.user_id = v_user
  WHERE o.id = p_organization_id;
  v_today := (now() AT TIME ZONE v_tz)::date;
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
    -- recent_actions: action items whose latest activity (added / resolved /
    -- dismissed) is within the last 7 days, scoped to items the user can act on.
    (SELECT count(*)::INTEGER FROM public.action_items ai
      WHERE ai.organization_id = p_organization_id
        AND ai.deleted_at IS NULL
        AND (ai.assigned_to IS NULL OR ai.assigned_to = v_user)
        AND GREATEST(ai.created_at, COALESCE(ai.resolved_at, ai.dismissed_at, ai.updated_at))
            >= now() - interval '7 days')
    FROM counts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_notification_counters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_counters(UUID) TO authenticated;

COMMIT;
