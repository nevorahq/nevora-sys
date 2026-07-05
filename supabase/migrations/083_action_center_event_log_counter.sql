-- ============================================================
-- Migration 083: "Действия" counter = UNSEEN event-log activity
-- ============================================================
-- 082 made recent_actions count all recent action_items, which saturates at 99+
-- (an org easily has >100 in 7 days). The badge should instead behave like an
-- activity-log indicator: how many domain events (every create / update / delete
-- across ALL modules) happened SINCE the user last opened the Action Center.
-- Opening /dashboard/actions stamps a "seen" marker, resetting the badge.
--
-- This migration:
--   A. action_center_seen  — per-user "last opened the Action Center" timestamp.
--   B. mark_action_center_seen(org) — upsert last_seen_at = now().
--   C. get_notification_counters — recent_actions now counts unseen domain_events
--      (capped at 100 so the query stays cheap; the UI renders 100 as "99+").

BEGIN;

-- ============================================================
-- A. Per-user seen marker
-- ============================================================
CREATE TABLE IF NOT EXISTS public.action_center_seen (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE public.action_center_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_center_seen_select"
  ON public.action_center_seen FOR SELECT
  USING (public.is_org_member(organization_id) AND user_id = auth.uid());

CREATE POLICY "action_center_seen_insert"
  ON public.action_center_seen FOR INSERT
  WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());

CREATE POLICY "action_center_seen_update"
  ON public.action_center_seen FOR UPDATE
  USING (public.is_org_member(organization_id) AND user_id = auth.uid())
  WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());

-- ============================================================
-- B. mark_action_center_seen — called when the page is opened
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_action_center_seen(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.action_center_seen (organization_id, user_id, last_seen_at)
  VALUES (p_organization_id, auth.uid(), now())
  ON CONFLICT (organization_id, user_id) DO UPDATE SET last_seen_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_action_center_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_action_center_seen(uuid) TO authenticated;

-- ============================================================
-- C. Recreate counters — recent_actions = unseen domain events
-- ============================================================
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

  -- Unseen window: everything after the user last opened the Action Center. If
  -- they never opened it, fall back to the last hour so a brand-new user is not
  -- greeted with a saturated badge.
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
    -- recent_actions: unseen domain events (all modules), capped at 100.
    (SELECT count(*)::INTEGER FROM (
      SELECT 1 FROM public.domain_events de
      WHERE de.organization_id = p_organization_id
        AND de.created_at > v_since
      LIMIT 100
    ) capped)
    FROM counts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_notification_counters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_counters(UUID) TO authenticated;

COMMIT;
