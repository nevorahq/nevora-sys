-- Durable reminder milestones. Notifications remain delivery history; domain
-- rows and action_items remain the business/attention sources of truth.

BEGIN;

-- Reconcile legacy user-owned columns with the organization-owned write model
-- already used by the Server Actions. On a fresh rebuild from 000 the legacy
-- user_id column still exists: backfill created_by/updated_by from it and relax
-- its NOT NULL. On the live database user_id was already dropped out-of-band
-- from BOTH tables (the same way todos.user_id was dropped in 031), so the
-- user_id-dependent steps are guarded by a column-existence check and become a
-- no-op there. created_by is the canonical owner column going forward.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id') THEN
    UPDATE public.subscriptions SET created_by = user_id WHERE created_by IS NULL;
    UPDATE public.subscriptions SET updated_by = COALESCE(updated_by, created_by, user_id) WHERE updated_by IS NULL;
    ALTER TABLE public.subscriptions ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'money_transactions' AND column_name = 'user_id') THEN
    UPDATE public.money_transactions SET created_by = user_id WHERE created_by IS NULL;
    UPDATE public.money_transactions SET updated_by = COALESCE(updated_by, created_by, user_id) WHERE updated_by IS NULL;
    ALTER TABLE public.money_transactions ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;

CREATE TABLE public.reminder_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('task', 'subscription', 'payment', 'document', 'action_item')),
  source_id UUID NOT NULL,
  source_due_at TIMESTAMPTZ,
  trigger_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('info', 'normal', 'high', 'critical')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'skipped', 'cancelled', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failure_reason TEXT,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

ALTER TABLE public.notifications
  ADD COLUMN reminder_schedule_id UUID;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_reminder_schedule_org_fk
  FOREIGN KEY (reminder_schedule_id, organization_id)
  REFERENCES public.reminder_schedules(id, organization_id);

CREATE INDEX reminder_schedules_due_pending_idx
  ON public.reminder_schedules (scheduled_at, organization_id)
  WHERE status = 'pending';
CREATE INDEX reminder_schedules_source_idx
  ON public.reminder_schedules (organization_id, source_type, source_id, status);
CREATE INDEX reminder_schedules_recipient_idx
  ON public.reminder_schedules (organization_id, recipient_user_id, status, scheduled_at);

CREATE TABLE public.reminder_schedule_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reminder_schedule_id UUID NOT NULL REFERENCES public.reminder_schedules(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL CHECK (event_name IN ('scheduled', 'claimed', 'delivered', 'skipped', 'failed', 'cancelled')),
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reminder_schedule_events_schedule_idx
  ON public.reminder_schedule_events (reminder_schedule_id, created_at DESC);

ALTER TABLE public.reminder_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_schedules_select_own"
  ON public.reminder_schedules FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY "reminder_schedule_events_select_own"
  ON public.reminder_schedule_events FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.reminder_schedules rs
      WHERE rs.id = reminder_schedule_id AND rs.recipient_user_id = auth.uid()
    )
  );

REVOKE ALL ON public.reminder_schedules, public.reminder_schedule_events FROM anon, authenticated;
GRANT SELECT ON public.reminder_schedules, public.reminder_schedule_events TO authenticated;

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
    AND public.can_write_data(organization_id)
    AND (action_item_id IS NULL OR EXISTS (
      SELECT 1 FROM public.action_items ai
      WHERE ai.id = public.notifications.action_item_id
        AND ai.organization_id = public.notifications.organization_id
    ))
    AND (reminder_schedule_id IS NULL OR EXISTS (
      SELECT 1 FROM public.reminder_schedules rs
      WHERE rs.id = public.notifications.reminder_schedule_id
        AND rs.organization_id = public.notifications.organization_id
        AND rs.recipient_user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "notification_deliveries_insert_own" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_insert_own"
  ON public.notification_deliveries FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.id = public.notification_deliveries.notification_id
        AND n.organization_id = public.notification_deliveries.organization_id
        AND n.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.touch_reminder_schedule_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER reminder_schedules_set_updated_at
  BEFORE UPDATE ON public.reminder_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_reminder_schedule_updated_at();

-- Date-only obligations execute at 09:00 in the recipient preference timezone,
-- then organization timezone, then UTC. PostgreSQL resolves DST using IANA data.
CREATE OR REPLACE FUNCTION public.reminder_execution_at(
  p_date DATE,
  p_user_id UUID,
  p_organization_id UUID
) RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT (p_date + time '09:00') AT TIME ZONE COALESCE(
    (SELECT p.timezone FROM public.user_notification_preferences p
      WHERE p.organization_id = p_organization_id AND p.user_id = p_user_id),
    (SELECT o.timezone FROM public.organizations o WHERE o.id = p_organization_id),
    'UTC'
  );
$$;

CREATE OR REPLACE FUNCTION public.cancel_source_reminders(
  p_organization_id UUID,
  p_source_type TEXT,
  p_source_id UUID,
  p_reason TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH cancelled AS (
    UPDATE public.reminder_schedules
    SET status = 'cancelled', cancelled_at = clock_timestamp(), failure_reason = left(p_reason, 200)
    WHERE organization_id = p_organization_id
      AND source_type = p_source_type
      AND source_id = p_source_id
      AND status IN ('pending', 'processing')
    RETURNING organization_id, id
  )
  INSERT INTO public.reminder_schedule_events (organization_id, reminder_schedule_id, event_name, details)
  SELECT organization_id, id, 'cancelled', jsonb_build_object('reason', left(p_reason, 200))
  FROM cancelled;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_reminder(
  p_organization_id UUID,
  p_workspace_id UUID,
  p_recipient_user_id UUID,
  p_source_type TEXT,
  p_source_id UUID,
  p_source_due_at TIMESTAMPTZ,
  p_trigger_type TEXT,
  p_priority TEXT,
  p_scheduled_at TIMESTAMPTZ,
  p_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_id UUID;
BEGIN
  IF p_scheduled_at < now() - interval '5 minutes'
     AND p_trigger_type NOT IN ('due-today', 'review-now', 'snooze-expired', 'backfill-overdue') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.reminder_schedules (
    organization_id, workspace_id, recipient_user_id, source_type, source_id,
    source_due_at, trigger_type, priority, scheduled_at, idempotency_key
  ) VALUES (
    p_organization_id, p_workspace_id, p_recipient_user_id, p_source_type, p_source_id,
    p_source_due_at, p_trigger_type, p_priority, GREATEST(p_scheduled_at, now()), p_idempotency_key
  ) ON CONFLICT (idempotency_key) DO UPDATE SET
    status = 'pending', scheduled_at = EXCLUDED.scheduled_at,
    source_due_at = EXCLUDED.source_due_at, priority = EXCLUDED.priority,
    cancelled_at = NULL, failure_reason = NULL
  WHERE reminder_schedules.status IN ('cancelled', 'skipped', 'failed')
  RETURNING reminder_schedules.id INTO v_id;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.reminder_schedule_events (organization_id, reminder_schedule_id, event_name)
    VALUES (p_organization_id, v_id, 'scheduled');
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_task_reminders(p_task_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t RECORD; r RECORD; m RECORD; v_due TIMESTAMPTZ; v_at TIMESTAMPTZ;
BEGIN
  SELECT id, organization_id, workspace_id, due_date, status, priority, deleted_at INTO t
  FROM public.todos WHERE id = p_task_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.cancel_source_reminders(t.organization_id, 'task', t.id, 'task_changed');
  IF t.deleted_at IS NOT NULL OR t.status = 'done' OR t.due_date IS NULL THEN
    UPDATE public.action_items SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
    WHERE organization_id = t.organization_id AND source_type = 'task' AND source_id = t.id
      AND status IN ('open', 'in_progress', 'snoozed');
    RETURN;
  END IF;
  FOR r IN SELECT ta.user_id FROM public.task_assignees ta JOIN public.memberships mb
    ON mb.organization_id = t.organization_id AND mb.user_id = ta.user_id AND mb.status = 'active'
    WHERE ta.task_id = t.id
  LOOP
    v_due := public.reminder_execution_at(t.due_date, r.user_id, t.organization_id);
    FOR m IN SELECT * FROM (VALUES
      (-7, 'due-minus-7d', 'normal'), (-3, 'due-minus-3d', 'high'),
      (-1, 'due-minus-1d', 'high'), (0, 'due-today', 'critical'),
      (1, 'overdue-plus-1d', 'critical'), (3, 'overdue-plus-3d', 'critical')
    ) x(day_offset, trigger_type, priority)
    LOOP
      IF t.priority = 'high' OR m.day_offset IN (-3, -1, 0, 1) THEN
        v_at := v_due + make_interval(days => m.day_offset);
        PERFORM public.enqueue_reminder(t.organization_id, t.workspace_id, r.user_id, 'task', t.id, v_due,
          m.trigger_type, m.priority, v_at,
          format('task:%s:%s:%s:%s', t.id, r.user_id, m.trigger_type, t.due_date));
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_subscription_reminders(p_subscription_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE s RECORD; m RECORD; v_due TIMESTAMPTZ;
BEGIN
  SELECT id, organization_id, workspace_id, created_by AS recipient_user_id, name, next_billing_date, is_active INTO s
  FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.cancel_source_reminders(s.organization_id, 'subscription', s.id, 'subscription_changed');
  UPDATE public.action_items SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
  WHERE organization_id = s.organization_id AND source_type = 'subscription' AND source_id = s.id
    AND status IN ('open', 'in_progress', 'snoozed');
  IF NOT s.is_active OR s.next_billing_date IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships mb WHERE mb.organization_id = s.organization_id AND mb.user_id = s.recipient_user_id AND mb.status = 'active'
  ) THEN
    RETURN;
  END IF;
  v_due := public.reminder_execution_at(s.next_billing_date, s.recipient_user_id, s.organization_id);
  FOR m IN SELECT * FROM (VALUES
    (-7, 'due-minus-7d', 'normal'), (-3, 'due-minus-3d', 'high'), (-1, 'due-minus-1d', 'high'),
    (0, 'due-today', 'critical'), (1, 'overdue-plus-1d', 'critical'), (3, 'overdue-plus-3d', 'critical')
  ) x(day_offset, trigger_type, priority)
  LOOP
    PERFORM public.enqueue_reminder(s.organization_id, s.workspace_id, s.recipient_user_id, 'subscription', s.id, v_due,
      m.trigger_type, m.priority, v_due + make_interval(days => m.day_offset),
      format('subscription:%s:%s:%s:%s', s.id, s.recipient_user_id, m.trigger_type, s.next_billing_date));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_payment_reminders(p_transaction_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE x RECORD; m RECORD; v_due TIMESTAMPTZ;
BEGIN
  SELECT id, organization_id, workspace_id, created_by AS recipient_user_id, transaction_date, status, deleted_at INTO x
  FROM public.money_transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.cancel_source_reminders(x.organization_id, 'payment', x.id, 'payment_changed');
  IF x.deleted_at IS NOT NULL OR x.status <> 'planned' OR x.transaction_date IS NULL THEN
    UPDATE public.action_items SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
    WHERE organization_id = x.organization_id AND source_type = 'transaction' AND source_id = x.id
      AND status IN ('open', 'in_progress', 'snoozed');
    RETURN;
  END IF;
  v_due := public.reminder_execution_at(x.transaction_date, x.recipient_user_id, x.organization_id);
  FOR m IN SELECT * FROM (VALUES
    (-3, 'due-minus-3d', 'high'), (-1, 'due-minus-1d', 'high'),
    (0, 'due-today', 'critical'), (1, 'overdue-plus-1d', 'critical')
  ) q(day_offset, trigger_type, priority)
  LOOP
    PERFORM public.enqueue_reminder(x.organization_id, x.workspace_id, x.recipient_user_id, 'payment', x.id, v_due,
      m.trigger_type, m.priority, v_due + make_interval(days => m.day_offset),
      format('payment:%s:%s:%s:%s', x.id, x.recipient_user_id, m.trigger_type, x.transaction_date));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_document_reminders(p_document_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE d RECORD; m RECORD;
BEGIN
  SELECT id, organization_id, workspace_id, created_by, status, created_at, deleted_at INTO d
  FROM public.documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM public.cancel_source_reminders(d.organization_id, 'document', d.id, 'document_changed');
  IF d.deleted_at IS NOT NULL OR d.status <> 'draft' OR d.created_by IS NULL THEN
    UPDATE public.action_items SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
    WHERE organization_id = d.organization_id AND source_type = 'document' AND source_id = d.id
      AND status IN ('open', 'in_progress', 'snoozed');
    RETURN;
  END IF;
  FOR m IN SELECT * FROM (VALUES
    (0, 'review-now', 'normal'), (24, 'review-plus-24h', 'normal'), (72, 'review-plus-72h', 'high')
  ) q(hour_offset, trigger_type, priority)
  LOOP
    PERFORM public.enqueue_reminder(d.organization_id, d.workspace_id, d.created_by, 'document', d.id, d.created_at,
      m.trigger_type, m.priority, d.created_at + make_interval(hours => m.hour_offset),
      format('document:%s:%s:%s:%s', d.id, d.created_by, m.trigger_type, d.created_at));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reminder_domain_change_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'todos' THEN PERFORM public.reschedule_task_reminders(COALESCE(NEW.id, OLD.id));
    ELSIF TG_TABLE_NAME = 'subscriptions' THEN PERFORM public.reschedule_subscription_reminders(COALESCE(NEW.id, OLD.id));
    ELSIF TG_TABLE_NAME = 'money_transactions' THEN PERFORM public.reschedule_payment_reminders(COALESCE(NEW.id, OLD.id));
    ELSIF TG_TABLE_NAME = 'documents' THEN PERFORM public.reschedule_document_reminders(COALESCE(NEW.id, OLD.id));
    ELSIF TG_TABLE_NAME = 'task_assignees' THEN PERFORM public.reschedule_task_reminders(COALESCE(NEW.task_id, OLD.task_id));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'reminder scheduling failed for %.%: %', TG_TABLE_NAME, TG_OP, SQLSTATE;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER todos_reminder_schedule AFTER INSERT OR UPDATE OF due_date, status, deleted_at, priority ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.reminder_domain_change_trigger();
CREATE TRIGGER task_assignees_reminder_schedule AFTER INSERT OR DELETE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.reminder_domain_change_trigger();
CREATE TRIGGER subscriptions_reminder_schedule AFTER INSERT OR UPDATE OF next_billing_date, is_active ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.reminder_domain_change_trigger();
CREATE TRIGGER payments_reminder_schedule AFTER INSERT OR UPDATE OF transaction_date, status, deleted_at ON public.money_transactions
  FOR EACH ROW EXECUTE FUNCTION public.reminder_domain_change_trigger();
CREATE TRIGGER documents_reminder_schedule AFTER INSERT OR UPDATE OF status, deleted_at ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.reminder_domain_change_trigger();

-- Snooze is attention state, never read state. It gets its own one-shot return.
CREATE OR REPLACE FUNCTION public.schedule_snoozed_action_return()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_user UUID;
BEGIN
  BEGIN
    IF NEW.status = 'snoozed' AND NEW.snoozed_until IS NOT NULL
       AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.snoozed_until IS DISTINCT FROM NEW.snoozed_until) THEN
      UPDATE public.reminder_schedules SET status = 'cancelled', cancelled_at = clock_timestamp(), failure_reason = 'resnoozed'
      WHERE source_type = 'action_item' AND source_id = NEW.id AND status IN ('pending', 'processing');
      v_user := COALESCE(NEW.assigned_to, auth.uid(), NEW.created_by);
      IF v_user IS NOT NULL THEN
        PERFORM public.enqueue_reminder(NEW.organization_id, NEW.workspace_id, v_user, 'action_item', NEW.id,
          NEW.snoozed_until, 'snooze-expired', 'high', NEW.snoozed_until,
          format('action-item:%s:%s:snooze:%s', NEW.id, v_user, NEW.snoozed_until));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'snooze reminder scheduling failed for %: %', NEW.id, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER action_items_schedule_snooze_return
  AFTER UPDATE OF status, snoozed_until ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.schedule_snoozed_action_return();

-- Atomic bounded worker. A row-level exception is isolated; retries use capped
-- minute backoff. In-app creation and schedule completion share one transaction.
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

      IF v_valid AND NOT COALESCE((
        SELECT CASE v_category
          WHEN 'task' THEN p.task_reminders_enabled
          WHEN 'subscription' THEN p.subscription_reminders_enabled
          WHEN 'payment' THEN p.payment_reminders_enabled
          WHEN 'document' THEN p.document_review_enabled
          ELSE p.action_center_enabled
        END
        FROM public.user_notification_preferences p
        WHERE p.organization_id = r.organization_id AND p.user_id = r.recipient_user_id
      ), true) THEN
        v_valid := false;
        UPDATE public.reminder_schedules SET status = 'skipped', failure_reason = 'category_disabled' WHERE id = r.id;
        INSERT INTO public.reminder_schedule_events (organization_id, reminder_schedule_id, event_name, details)
        VALUES (r.organization_id, r.id, 'skipped', '{"reason":"category_disabled"}');
        v_skipped := v_skipped + 1; CONTINUE;
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

-- Read state is deliberately independent: both operations touch every unread
-- delivery owned by the caller and no other lifecycle table.
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_organization_id UUID)
RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN RETURN 0; END IF;
  RETURN (SELECT count(*)::INTEGER FROM public.notifications
    WHERE organization_id = p_organization_id AND user_id = auth.uid() AND read_at IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_visible_notifications_read(p_organization_id UUID)
RETURNS INTEGER LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'organization access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.notifications SET read_at = COALESCE(read_at, now())
  WHERE organization_id = p_organization_id AND user_id = auth.uid() AND read_at IS NULL;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_notification_counters(p_organization_id UUID)
RETURNS TABLE(unread INTEGER, attention INTEGER, upcoming INTEGER, due_today INTEGER, overdue INTEGER, urgent INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_user UUID := auth.uid(); v_tz TEXT; v_today DATE;
BEGIN
  IF v_user IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RETURN QUERY SELECT 0, 0, 0, 0, 0, 0; RETURN;
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
    counts.upcoming, counts.due_today, counts.overdue, (counts.due_today + counts.overdue)::INTEGER FROM counts;
END;
$$;

-- Controlled backfill: dry-run by default and bounded by p_limit. Past
-- milestones are not replayed; reschedule helpers only retain current/future rows.
CREATE OR REPLACE FUNCTION public.backfill_reminder_schedules(
  p_organization_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_dry_run BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE r RECORD; recipient RECORD; v_tasks INT := 0; v_subscriptions INT := 0; v_payments INT := 0; v_documents INT := 0; v_due TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  FOR r IN SELECT id, organization_id, workspace_id, due_date FROM public.todos t WHERE organization_id = p_organization_id AND deleted_at IS NULL AND status <> 'done' AND due_date IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.reminder_schedules rs WHERE rs.organization_id = t.organization_id AND rs.source_type = 'task' AND rs.source_id = t.id)
    ORDER BY t.id LIMIT LEAST(p_limit, 500)
  LOOP
    v_tasks := v_tasks + 1;
    IF NOT p_dry_run THEN
      PERFORM public.reschedule_task_reminders(r.id);
      IF r.due_date < current_date THEN
        FOR recipient IN SELECT ta.user_id FROM public.task_assignees ta JOIN public.memberships mb ON mb.user_id = ta.user_id AND mb.organization_id = r.organization_id AND mb.status = 'active' WHERE ta.task_id = r.id
        LOOP
          v_due := public.reminder_execution_at(r.due_date, recipient.user_id, r.organization_id);
          PERFORM public.enqueue_reminder(r.organization_id, r.workspace_id, recipient.user_id, 'task', r.id, v_due,
            'backfill-overdue', 'critical', now(), format('task:%s:%s:backfill-overdue:%s', r.id, recipient.user_id, r.due_date));
        END LOOP;
      END IF;
    END IF;
  END LOOP;
  FOR r IN SELECT id, organization_id, workspace_id, next_billing_date, created_by AS recipient_user_id FROM public.subscriptions s WHERE organization_id = p_organization_id AND is_active
    AND NOT EXISTS (SELECT 1 FROM public.reminder_schedules rs WHERE rs.organization_id = s.organization_id AND rs.source_type = 'subscription' AND rs.source_id = s.id)
    ORDER BY s.id LIMIT LEAST(p_limit, 500)
  LOOP
    v_subscriptions := v_subscriptions + 1;
    IF NOT p_dry_run THEN
      PERFORM public.reschedule_subscription_reminders(r.id);
      IF r.next_billing_date < current_date THEN
        v_due := public.reminder_execution_at(r.next_billing_date, r.recipient_user_id, r.organization_id);
        PERFORM public.enqueue_reminder(r.organization_id, r.workspace_id, r.recipient_user_id, 'subscription', r.id, v_due,
          'backfill-overdue', 'critical', now(), format('subscription:%s:%s:backfill-overdue:%s', r.id, r.recipient_user_id, r.next_billing_date));
      END IF;
    END IF;
  END LOOP;
  FOR r IN SELECT id, organization_id, workspace_id, transaction_date, created_by AS recipient_user_id FROM public.money_transactions x WHERE organization_id = p_organization_id AND status = 'planned' AND deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.reminder_schedules rs WHERE rs.organization_id = x.organization_id AND rs.source_type = 'payment' AND rs.source_id = x.id)
    ORDER BY x.id LIMIT LEAST(p_limit, 500)
  LOOP
    v_payments := v_payments + 1;
    IF NOT p_dry_run THEN
      PERFORM public.reschedule_payment_reminders(r.id);
      IF r.transaction_date < current_date THEN
        v_due := public.reminder_execution_at(r.transaction_date, r.recipient_user_id, r.organization_id);
        PERFORM public.enqueue_reminder(r.organization_id, r.workspace_id, r.recipient_user_id, 'payment', r.id, v_due,
          'backfill-overdue', 'critical', now(), format('payment:%s:%s:backfill-overdue:%s', r.id, r.recipient_user_id, r.transaction_date));
      END IF;
    END IF;
  END LOOP;
  FOR r IN SELECT id FROM public.documents d WHERE organization_id = p_organization_id AND status = 'draft' AND deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.reminder_schedules rs WHERE rs.organization_id = d.organization_id AND rs.source_type = 'document' AND rs.source_id = d.id)
    ORDER BY d.id LIMIT LEAST(p_limit, 500)
  LOOP v_documents := v_documents + 1; IF NOT p_dry_run THEN PERFORM public.reschedule_document_reminders(r.id); END IF; END LOOP;
  RETURN jsonb_build_object('dry_run', p_dry_run, 'tasks', v_tasks, 'subscriptions', v_subscriptions, 'payments', v_payments, 'documents', v_documents);
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_reminders(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backfill_reminder_schedules(UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_reminders(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_reminder_schedules(UUID, INTEGER, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.get_notification_counters(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_notification_counters(UUID) TO authenticated;

-- Trigger helpers are internal-only.
REVOKE ALL ON FUNCTION public.cancel_source_reminders(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_reminder(UUID, UUID, UUID, TEXT, UUID, TIMESTAMPTZ, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_task_reminders(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_subscription_reminders(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_payment_reminders(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_document_reminders(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reminder_domain_change_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_snoozed_action_return() FROM PUBLIC, anon, authenticated;

COMMIT;
