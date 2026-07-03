-- Browser-tab unread indicator over the existing Action Center notifications.

CREATE INDEX IF NOT EXISTS notifications_unread_org_user_idx
  ON public.notifications (organization_id, user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Migration 048 defined Action Center RLS but omitted table privileges.
-- The count joins action_items and existing resolve/dismiss actions update it.
GRANT SELECT, UPDATE ON public.action_items TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_terminal_action_notifications_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
     OR (OLD.status IS DISTINCT FROM NEW.status
         AND NEW.status IN ('resolved', 'dismissed', 'cancelled')) THEN
    UPDATE public.notifications
    SET read_at = COALESCE(read_at, now())
    WHERE organization_id = NEW.organization_id
      AND action_item_id = NEW.id
      AND read_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS action_items_mark_notifications_read ON public.action_items;
CREATE TRIGGER action_items_mark_notifications_read
  AFTER UPDATE OF status, deleted_at ON public.action_items
  FOR EACH ROW
  WHEN (
    (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    OR (
      OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('resolved', 'dismissed', 'cancelled')
    )
  )
  EXECUTE FUNCTION public.mark_terminal_action_notifications_read();

REVOKE ALL ON FUNCTION public.mark_terminal_action_notifications_read() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;

-- Notification rows are delivery records. Browser users may only mutate read_at
-- through the narrowly-scoped RPCs below; ownership, content and links remain
-- immutable even when PostgREST is called directly.
REVOKE UPDATE ON public.notifications FROM authenticated;

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND (
      action_item_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.action_items ai
        WHERE ai.id = public.notifications.action_item_id
          AND ai.organization_id = public.notifications.organization_id
      )
    )
  );

CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_organization_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RETURN 0;
  END IF;

  RETURN (
  SELECT count(*)::INTEGER
  FROM public.notifications n
  LEFT JOIN public.action_items ai
    ON ai.id = n.action_item_id
   AND ai.organization_id = n.organization_id
  LEFT JOIN public.user_notification_preferences p
    ON p.organization_id = n.organization_id AND p.user_id = n.user_id
  WHERE n.organization_id = p_organization_id
    AND n.user_id = v_user_id
    AND n.read_at IS NULL
    AND (
      n.action_item_id IS NULL
      OR (
        ai.id IS NOT NULL
        AND ai.deleted_at IS NULL
        AND ai.status IN ('open', 'in_progress', 'snoozed', 'failed')
      )
    )
    AND CASE n.category
      WHEN 'task' THEN COALESCE(p.task_reminders_enabled, true)
      WHEN 'subscription' THEN COALESCE(p.subscription_reminders_enabled, true)
      WHEN 'payment' THEN COALESCE(p.payment_reminders_enabled, true)
      WHEN 'document' THEN COALESCE(p.document_review_enabled, true)
      WHEN 'action_center' THEN COALESCE(p.action_center_enabled, true)
      ELSE false
    END
    AND (n.category <> 'action_center' OR n.priority IN ('high', 'critical'))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_visible_notifications_read(p_organization_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'organization access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications n
  SET read_at = COALESCE(n.read_at, now())
  WHERE n.organization_id = p_organization_id
    AND n.user_id = auth.uid()
    AND n.read_at IS NULL
    AND (
      n.action_item_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.action_items ai
        WHERE ai.id = n.action_item_id
          AND ai.organization_id = n.organization_id
          AND ai.deleted_at IS NULL
          AND ai.status IN ('open', 'in_progress', 'snoozed', 'failed')
      )
    )
    AND CASE n.category
      WHEN 'task' THEN COALESCE((SELECT p.task_reminders_enabled FROM public.user_notification_preferences p WHERE p.organization_id = n.organization_id AND p.user_id = n.user_id), true)
      WHEN 'subscription' THEN COALESCE((SELECT p.subscription_reminders_enabled FROM public.user_notification_preferences p WHERE p.organization_id = n.organization_id AND p.user_id = n.user_id), true)
      WHEN 'payment' THEN COALESCE((SELECT p.payment_reminders_enabled FROM public.user_notification_preferences p WHERE p.organization_id = n.organization_id AND p.user_id = n.user_id), true)
      WHEN 'document' THEN COALESCE((SELECT p.document_review_enabled FROM public.user_notification_preferences p WHERE p.organization_id = n.organization_id AND p.user_id = n.user_id), true)
      WHEN 'action_center' THEN COALESCE((SELECT p.action_center_enabled FROM public.user_notification_preferences p WHERE p.organization_id = n.organization_id AND p.user_id = n.user_id), true)
      ELSE false
    END
    AND (n.category <> 'action_center' OR n.priority IN ('high', 'critical'));

  RETURN public.get_unread_notification_count(p_organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_organization_id UUID,
  p_notification_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'organization access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND organization_id = p_organization_id
    AND user_id = auth.uid()
    AND read_at IS NULL;

  RETURN public.get_unread_notification_count(p_organization_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_unread_notification_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_visible_notifications_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_visible_notifications_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID, UUID) TO authenticated;
