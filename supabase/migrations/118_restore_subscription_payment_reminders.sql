-- ============================================================
-- Migration 118: Restore subscription payment reminders
-- ============================================================
-- Migration 117 replaced the payment reminder schedule for subscriptions with
-- renewal-decision reminders. As a side effect a subscription with renewal
-- decisions switched off (renewal_reminder_days IS NULL), or one whose
-- decision was already recorded as keep / wont_renew, received no payment
-- reminder at all — not even on the billing date — and every renewal-case
-- change cancelled the payment milestones through cancel_source_reminders().
--
-- The renewal decision is supposed to sit next to payment tracking, not
-- replace it. After this migration:
--   * payment milestones (due -7d/-3d/-1d, due today, overdue +1d/+3d) are
--     scheduled for every active subscription again, exactly as in 075;
--   * the renewal decision adds one 'review-now' reminder at the decision
--     date while its case is pending or reviewing. 117's separate renewal-day
--     and overdue reminders duplicated the payment milestones and are retired;
--   * recording a decision, snoozing it or disabling renewal decisions only
--     touches the renewal reminder (idempotency_key 'subscription-renewal:%').
--
-- Idempotent: safe to re-run.

BEGIN;

-- Cancel only the renewal-decision reminders of one subscription; payment
-- milestones keep their own lifecycle.
CREATE OR REPLACE FUNCTION public.cancel_subscription_renewal_reminders(
  p_organization_id UUID,
  p_subscription_id UUID,
  p_reason TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH cancelled AS (
    UPDATE public.reminder_schedules
    SET status = 'cancelled', cancelled_at = clock_timestamp(), failure_reason = left(p_reason, 200)
    WHERE organization_id = p_organization_id
      AND source_type = 'subscription'
      AND source_id = p_subscription_id
      AND idempotency_key LIKE 'subscription-renewal:%'
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

-- (Re)schedule the single renewal-decision reminder for the current case.
CREATE OR REPLACE FUNCTION public.reschedule_subscription_renewal_reminder(p_subscription_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  s RECORD;
  c RECORD;
BEGIN
  SELECT id, organization_id, workspace_id, created_by AS recipient_user_id,
         next_billing_date, is_active, cancelled_at, auto_renews, renewal_reminder_days
    INTO s
  FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM public.cancel_subscription_renewal_reminders(
    s.organization_id, s.id, 'renewal_changed'
  );

  IF NOT s.is_active OR s.cancelled_at IS NOT NULL OR NOT s.auto_renews
     OR s.renewal_reminder_days IS NULL OR s.next_billing_date IS NULL
     OR s.recipient_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.memberships mb
       WHERE mb.organization_id = s.organization_id
         AND mb.user_id = s.recipient_user_id
         AND mb.status = 'active'
     ) THEN
    RETURN;
  END IF;

  SELECT id, decision_due_date, status
    INTO c
  FROM public.subscription_renewal_cases
  WHERE organization_id = s.organization_id
    AND subscription_id = s.id
    AND renewal_date = s.next_billing_date
  LIMIT 1;
  IF NOT FOUND OR c.status IN ('keep', 'wont_renew') THEN RETURN; END IF;

  -- source_due_at stays anchored to next_billing_date: the worker revalidates
  -- subscription reminders against that source date.
  PERFORM public.enqueue_reminder(
    s.organization_id, s.workspace_id, s.recipient_user_id,
    'subscription', s.id,
    public.reminder_execution_at(s.next_billing_date, s.recipient_user_id, s.organization_id),
    'review-now', 'high',
    GREATEST(public.reminder_execution_at(c.decision_due_date, s.recipient_user_id, s.organization_id), now()),
    format('subscription-renewal:%s:%s:review:%s', s.id, s.recipient_user_id, c.id)
  );
END;
$$;

-- Called by reminder_domain_change_trigger on subscription changes: the 075
-- payment schedule plus the renewal-decision reminder. Open payment attention
-- items are resolved as in 075; the renewal_required projection is owned by
-- sync_subscription_renewal_attention and is left alone.
CREATE OR REPLACE FUNCTION public.reschedule_subscription_reminders(p_subscription_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE s RECORD; m RECORD; v_due TIMESTAMPTZ;
BEGIN
  SELECT id, organization_id, workspace_id, created_by AS recipient_user_id,
         next_billing_date, is_active, cancelled_at
    INTO s
  FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM public.cancel_source_reminders(s.organization_id, 'subscription', s.id, 'subscription_changed');
  UPDATE public.action_items SET status = 'resolved', resolved_at = COALESCE(resolved_at, now())
  WHERE organization_id = s.organization_id AND source_type = 'subscription' AND source_id = s.id
    AND type <> 'renewal_required'
    AND status IN ('open', 'in_progress', 'snoozed');

  IF NOT s.is_active OR s.cancelled_at IS NOT NULL OR s.next_billing_date IS NULL
     OR s.recipient_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.memberships mb
       WHERE mb.organization_id = s.organization_id AND mb.user_id = s.recipient_user_id AND mb.status = 'active'
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

  PERFORM public.reschedule_subscription_renewal_reminder(s.id);
END;
$$;

-- 117 bodies, with every cancel_source_reminders() / full reschedule call
-- narrowed to the renewal-decision reminder.
CREATE OR REPLACE FUNCTION public.sync_subscription_renewal_case()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_due DATE;
BEGIN
  IF NEW.is_active
     AND NEW.cancelled_at IS NULL
     AND NEW.auto_renews
     AND NEW.renewal_reminder_days IS NOT NULL THEN
    v_due := NEW.next_billing_date - NEW.renewal_reminder_days;

    IF TG_OP = 'UPDATE' AND OLD.next_billing_date IS DISTINCT FROM NEW.next_billing_date THEN
      UPDATE public.subscription_renewal_cases
      SET renewal_date = NEW.next_billing_date,
          decision_due_date = v_due,
          workspace_id = NEW.workspace_id
      WHERE organization_id = NEW.organization_id
        AND subscription_id = NEW.id
        AND renewal_date = OLD.next_billing_date
        AND status IN ('pending', 'reviewing')
        AND NOT EXISTS (
          SELECT 1 FROM public.subscription_renewal_cases existing
          WHERE existing.organization_id = NEW.organization_id
            AND existing.subscription_id = NEW.id
            AND existing.renewal_date = NEW.next_billing_date
        );
    END IF;

    INSERT INTO public.subscription_renewal_cases (
      organization_id, workspace_id, subscription_id, renewal_date,
      decision_due_date, status, created_by
    ) VALUES (
      NEW.organization_id, NEW.workspace_id, NEW.id, NEW.next_billing_date,
      v_due, 'pending', NEW.created_by
    )
    ON CONFLICT (organization_id, subscription_id, renewal_date) DO UPDATE SET
      decision_due_date = CASE
        WHEN subscription_renewal_cases.status IN ('pending', 'reviewing')
          THEN EXCLUDED.decision_due_date
        ELSE subscription_renewal_cases.decision_due_date
      END,
      workspace_id = EXCLUDED.workspace_id;
  ELSE
    UPDATE public.action_items
    SET status = 'resolved', resolved_at = COALESCE(resolved_at, now()), snoozed_until = NULL
    WHERE organization_id = NEW.organization_id
      AND source_type = 'subscription'
      AND source_id = NEW.id
      AND type = 'renewal_required'
      AND deleted_at IS NULL
      AND status IN ('open', 'in_progress', 'snoozed');
    PERFORM public.cancel_subscription_renewal_reminders(
      NEW.organization_id, NEW.id, 'renewal_decisions_disabled'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_subscription_renewal_attention()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  s RECORD;
  v_attention_status TEXT;
  v_priority TEXT;
  v_score INTEGER;
BEGIN
  SELECT id, organization_id, workspace_id, name, amount, currency, created_by,
         next_billing_date, is_active, auto_renews, renewal_reminder_days
    INTO s
  FROM public.subscriptions
  WHERE id = NEW.subscription_id AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.status IN ('keep', 'wont_renew') OR NOT s.is_active OR NOT s.auto_renews THEN
    UPDATE public.action_items
    SET status = 'resolved',
        resolved_at = COALESCE(resolved_at, now()),
        snoozed_until = NULL,
        metadata = metadata || jsonb_build_object(
          'renewal_case_id', NEW.id,
          'renewal_decision', NEW.status,
          'renewal_date', NEW.renewal_date,
          'decision_due_date', NEW.decision_due_date
        )
    WHERE organization_id = NEW.organization_id
      AND type = 'renewal_required'
      AND source_type = 'subscription'
      AND source_id = NEW.subscription_id
      AND deleted_at IS NULL;
    PERFORM public.cancel_subscription_renewal_reminders(
      NEW.organization_id, NEW.subscription_id, 'renewal_decision_resolved'
    );
    RETURN NEW;
  END IF;

  v_attention_status := CASE
    WHEN NEW.snoozed_until IS NOT NULL AND NEW.snoozed_until > now() THEN 'snoozed'
    WHEN NEW.status = 'reviewing' THEN 'in_progress'
    ELSE 'open'
  END;
  v_priority := CASE
    WHEN NEW.decision_due_date < current_date THEN 'critical'
    WHEN NEW.decision_due_date <= current_date + 3 THEN 'high'
    ELSE 'medium'
  END;
  v_score := CASE v_priority WHEN 'critical' THEN 100 WHEN 'high' THEN 80 ELSE 50 END;

  INSERT INTO public.action_items (
    organization_id, workspace_id, title, description, type, status, priority,
    priority_score, source_type, source_id, primary_entity_type,
    primary_entity_id, due_at, snoozed_until, assigned_to, created_by, metadata
  ) VALUES (
    NEW.organization_id, s.workspace_id,
    'Renewal decision: ' || s.name,
    'Decide whether to keep, review, or stop this subscription before renewal.',
    'renewal_required', v_attention_status, v_priority, v_score,
    'subscription', NEW.subscription_id, 'subscription', NEW.subscription_id,
    NEW.decision_due_date::timestamptz, NEW.snoozed_until, s.created_by, s.created_by,
    jsonb_build_object(
      'renewal_case_id', NEW.id,
      'renewal_status', NEW.status,
      'renewal_date', NEW.renewal_date,
      'decision_due_date', NEW.decision_due_date,
      'amount', s.amount,
      'currency', s.currency
    )
  )
  ON CONFLICT DO NOTHING;

  -- Migration 097 widened action_items_dedupe_idx with an expression over
  -- suggestion_id. A targetless insert handles both the original and widened
  -- index; the explicit update below makes the projection deterministic.
  UPDATE public.action_items
  SET workspace_id = s.workspace_id,
      title = 'Renewal decision: ' || s.name,
      description = 'Decide whether to keep, review, or stop this subscription before renewal.',
      status = v_attention_status,
      priority = v_priority,
      priority_score = v_score,
      primary_entity_type = 'subscription',
      primary_entity_id = NEW.subscription_id,
      due_at = NEW.decision_due_date::timestamptz,
      snoozed_until = NEW.snoozed_until,
      resolved_at = NULL,
      dismissed_at = NULL,
      assigned_to = s.created_by,
      metadata = metadata || jsonb_build_object(
        'renewal_case_id', NEW.id,
        'renewal_status', NEW.status,
        'renewal_date', NEW.renewal_date,
        'decision_due_date', NEW.decision_due_date,
        'amount', s.amount,
        'currency', s.currency
      )
  WHERE organization_id = NEW.organization_id
    AND type = 'renewal_required'
    AND source_type = 'subscription'
    AND source_id = NEW.subscription_id
    AND deleted_at IS NULL
    AND suggestion_id IS NULL;

  PERFORM public.reschedule_subscription_renewal_reminder(NEW.subscription_id);
  RETURN NEW;
END;
$$;

-- Retire 117's renewal-day and renewal-overdue reminders: the payment
-- milestones cover the same moments.
UPDATE public.reminder_schedules
SET status = 'cancelled', cancelled_at = clock_timestamp(),
    failure_reason = 'superseded_by_payment_milestones'
WHERE source_type = 'subscription'
  AND status IN ('pending', 'processing')
  AND (idempotency_key LIKE 'subscription-renewal:%:renewal:%'
       OR idempotency_key LIKE 'subscription-renewal:%:overdue:%');

-- Restore the payment schedule for current subscriptions. Past billing dates
-- are skipped so the backfill cannot fire stale "due today" reminders.
SELECT public.reschedule_subscription_reminders(s.id)
FROM public.subscriptions s
WHERE s.is_active
  AND s.cancelled_at IS NULL
  AND s.next_billing_date >= current_date;

REVOKE ALL ON FUNCTION public.cancel_subscription_renewal_reminders(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_subscription_renewal_reminder(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_subscription_reminders(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_subscription_renewal_case() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_subscription_renewal_attention() FROM PUBLIC, anon, authenticated;

COMMIT;
