-- Notification category preferences control disruptive delivery channels, not
-- durable in-app history. A due reminder must still create/update its action
-- item and notification so billing/security-relevant attention cannot vanish.

CREATE OR REPLACE FUNCTION public.process_due_reminders(p_limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE r RECORD; v_valid BOOLEAN; v_title TEXT; v_body TEXT; v_target TEXT; v_category TEXT;
  v_action UUID; v_notification UUID; v_delivered INT := 0; v_skipped INT := 0; v_failed INT := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  FOR r IN
    WITH claim AS (
      SELECT id FROM public.reminder_schedules
      WHERE (status = 'pending' AND scheduled_at <= now())
         OR (status = 'processing' AND last_attempt_at < now() - interval '15 minutes')
      ORDER BY scheduled_at, id FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit, 1), 200)
    )
    UPDATE public.reminder_schedules rs SET status = 'processing', attempt_count = attempt_count + 1,
      last_attempt_at = now(), failure_reason = NULL
    FROM claim WHERE rs.id = claim.id RETURNING rs.*
  LOOP
    BEGIN
      INSERT INTO public.reminder_schedule_events (organization_id, reminder_schedule_id, event_name)
      VALUES (r.organization_id, r.id, 'claimed');
      v_valid := EXISTS (SELECT 1 FROM public.memberships mb WHERE mb.organization_id = r.organization_id
        AND mb.user_id = r.recipient_user_id AND mb.status = 'active');
      v_title := NULL; v_body := NULL; v_target := '/dashboard/actions'; v_category := r.source_type;

      IF v_valid AND r.source_type = 'task' THEN
        SELECT t.title, t.due_date IS NOT NULL AND t.status <> 'done' AND t.deleted_at IS NULL
          AND public.reminder_execution_at(t.due_date, r.recipient_user_id, t.organization_id) = r.source_due_at
          AND EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = r.recipient_user_id)
        INTO v_title, v_valid FROM public.todos t WHERE t.id = r.source_id AND t.organization_id = r.organization_id;
        v_body := CASE WHEN r.trigger_type LIKE 'overdue%' THEN 'This task is overdue.' WHEN r.trigger_type = 'due-today' THEN 'This task is due today.' ELSE 'This task is approaching its due date.' END;
        v_target := '/dashboard/tasks/' || r.source_id; v_category := 'task';
      ELSIF v_valid AND r.source_type = 'subscription' THEN
        SELECT s.name, s.is_active AND public.reminder_execution_at(s.next_billing_date, r.recipient_user_id, s.organization_id) = r.source_due_at
          INTO v_title, v_valid FROM public.subscriptions s WHERE s.id = r.source_id AND s.organization_id = r.organization_id AND s.created_by = r.recipient_user_id;
        v_body := CASE WHEN r.trigger_type LIKE 'overdue%' THEN 'Subscription payment is overdue.' WHEN r.trigger_type = 'due-today' THEN 'Subscription payment is due today.' ELSE 'Subscription payment is approaching.' END;
        v_target := '/dashboard/subscriptions'; v_category := 'subscription';
      ELSIF v_valid AND r.source_type = 'payment' THEN
        SELECT x.title, x.status = 'planned' AND x.deleted_at IS NULL
          AND public.reminder_execution_at(x.transaction_date, r.recipient_user_id, x.organization_id) = r.source_due_at
          INTO v_title, v_valid FROM public.money_transactions x WHERE x.id = r.source_id AND x.organization_id = r.organization_id AND x.created_by = r.recipient_user_id;
        v_body := CASE WHEN r.trigger_type LIKE 'overdue%' THEN 'This planned payment is overdue.' WHEN r.trigger_type = 'due-today' THEN 'This planned payment is due today.' ELSE 'A planned payment is approaching.' END;
        v_target := '/dashboard/money'; v_category := 'payment';
      ELSIF v_valid AND r.source_type = 'document' THEN
        SELECT d.title, d.status = 'draft' AND d.deleted_at IS NULL AND d.created_by = r.recipient_user_id
          INTO v_title, v_valid FROM public.documents d WHERE d.id = r.source_id AND d.organization_id = r.organization_id;
        v_body := 'This document still requires review.'; v_target := '/dashboard/documents/' || r.source_id; v_category := 'document';
      ELSIF v_valid AND r.source_type = 'action_item' THEN
        SELECT ai.title, ai.status = 'snoozed' AND ai.snoozed_until <= now() INTO v_title, v_valid
        FROM public.action_items ai WHERE ai.id = r.source_id AND ai.organization_id = r.organization_id AND ai.deleted_at IS NULL;
        IF v_valid THEN UPDATE public.action_items SET status = 'open', snoozed_until = NULL WHERE id = r.source_id; END IF;
        v_body := 'A snoozed action needs your attention again.'; v_category := 'action_center';
      ELSE v_valid := false;
      END IF;

      IF NOT COALESCE(v_valid, false) OR v_title IS NULL THEN
        UPDATE public.reminder_schedules SET status = 'skipped', failure_reason = 'source_inactive_or_stale' WHERE id = r.id;
        INSERT INTO public.reminder_schedule_events (organization_id, reminder_schedule_id, event_name, details)
        VALUES (r.organization_id, r.id, 'skipped', '{"reason":"source_inactive_or_stale"}');
        v_skipped := v_skipped + 1; CONTINUE;
      END IF;

      IF r.source_type <> 'action_item' THEN
        SELECT ai.id INTO v_action FROM public.action_items ai
        WHERE ai.organization_id = r.organization_id AND ai.source_id = r.source_id
          AND ai.source_type = CASE WHEN r.source_type = 'payment' THEN 'transaction' ELSE r.source_type END
          AND ai.deleted_at IS NULL ORDER BY ai.created_at LIMIT 1;
        IF v_action IS NULL THEN
          INSERT INTO public.action_items (organization_id, workspace_id, title, description, type, status, priority,
            priority_score, source_type, source_id, primary_entity_type, primary_entity_id, due_at, assigned_to, created_by)
          VALUES (r.organization_id, r.workspace_id, v_title, v_body,
            CASE r.source_type WHEN 'task' THEN CASE WHEN r.scheduled_at > r.source_due_at THEN 'overdue' ELSE 'due_soon' END
              WHEN 'subscription' THEN 'renewal_required' WHEN 'payment' THEN 'draft_review' ELSE 'document_review' END,
            'open', CASE r.priority WHEN 'normal' THEN 'medium' ELSE r.priority END,
            CASE r.priority WHEN 'critical' THEN 100 WHEN 'high' THEN 75 ELSE 40 END,
            CASE WHEN r.source_type = 'payment' THEN 'transaction' ELSE r.source_type END, r.source_id,
            CASE WHEN r.source_type = 'payment' THEN 'transaction' ELSE r.source_type END, r.source_id,
            r.source_due_at, r.recipient_user_id, r.recipient_user_id)
          RETURNING id INTO v_action;
        ELSE
          UPDATE public.action_items SET status = 'open', resolved_at = NULL, dismissed_at = NULL,
            title = v_title, description = v_body, due_at = r.source_due_at,
            priority = CASE r.priority WHEN 'normal' THEN 'medium' ELSE r.priority END,
            priority_score = CASE r.priority WHEN 'critical' THEN 100 WHEN 'high' THEN 75 ELSE 40 END
          WHERE id = v_action;
        END IF;
      ELSE v_action := r.source_id;
      END IF;

      INSERT INTO public.notifications (organization_id, workspace_id, user_id, type, title, body, action_item_id,
        category, priority, target_url, deduplication_key, reminder_schedule_id)
      VALUES (r.organization_id, r.workspace_id, r.recipient_user_id, v_category, v_title, v_body, v_action,
        v_category, r.priority, v_target, r.idempotency_key, r.id)
      ON CONFLICT (organization_id, user_id, deduplication_key) WHERE deduplication_key IS NOT NULL
      DO UPDATE SET reminder_schedule_id = EXCLUDED.reminder_schedule_id
      RETURNING id INTO v_notification;
      INSERT INTO public.notification_deliveries (organization_id, user_id, notification_id, channel, idempotency_key, status)
      VALUES (r.organization_id, r.recipient_user_id, v_notification, 'in_app', r.idempotency_key || ':in_app', 'sent')
      ON CONFLICT (channel, idempotency_key) DO NOTHING;
      UPDATE public.reminder_schedules SET status = 'delivered', delivered_at = now(), notification_id = v_notification WHERE id = r.id;
      INSERT INTO public.reminder_schedule_events (organization_id, reminder_schedule_id, event_name, details)
      VALUES (r.organization_id, r.id, 'delivered', jsonb_build_object('notification_id', v_notification));
      v_delivered := v_delivered + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.reminder_schedules SET status = CASE WHEN attempt_count >= 5 THEN 'failed' ELSE 'pending' END,
        scheduled_at = now() + make_interval(mins => LEAST(60, attempt_count * attempt_count)), failure_reason = left(SQLSTATE || ':' || SQLERRM, 500)
      WHERE id = r.id;
      INSERT INTO public.reminder_schedule_events (organization_id, reminder_schedule_id, event_name, details)
      VALUES (r.organization_id, r.id, 'failed', jsonb_build_object('code', SQLSTATE));
      v_failed := v_failed + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('delivered', v_delivered, 'skipped', v_skipped, 'failed', v_failed);
END;
$$;
