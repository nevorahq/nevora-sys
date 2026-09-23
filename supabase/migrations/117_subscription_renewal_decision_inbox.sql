-- ============================================================
-- Migration 116: Subscription Renewal Decision Inbox
-- ============================================================
-- Renewal intent is deliberately separate from payment-cycle state and from
-- the terminal vendor cancellation recorded on public.subscriptions.

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renews BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS renewal_reminder_days INTEGER
    CHECK (renewal_reminder_days IS NULL OR renewal_reminder_days BETWEEN 1 AND 180);

UPDATE public.subscriptions
SET renewal_reminder_days = CASE billing_cycle
  WHEN 'yearly' THEN 30
  ELSE 7
END
WHERE renewal_reminder_days IS NULL
  AND auto_renews = true;

COMMENT ON COLUMN public.subscriptions.auto_renews IS
  'User-reported renewal behaviour. This flag never cancels or renews a vendor subscription.';
COMMENT ON COLUMN public.subscriptions.renewal_reminder_days IS
  'Days before next_billing_date when a renewal decision is due. NULL disables renewal decisions without disabling payment tracking.';

CREATE TABLE IF NOT EXISTS public.subscription_renewal_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id      UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  subscription_id   UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  renewal_date      DATE NOT NULL,
  decision_due_date DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'reviewing', 'keep', 'wont_renew')),
  snoozed_until     TIMESTAMPTZ,
  decision_note     TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 2000),
  review_task_id    UUID REFERENCES public.todos(id) ON DELETE SET NULL,
  cancellation_task_id UUID REFERENCES public.todos(id) ON DELETE SET NULL,
  decided_at        TIMESTAMPTZ,
  decided_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_renewal_cases_period_uniq
    UNIQUE (organization_id, subscription_id, renewal_date),
  CONSTRAINT subscription_renewal_cases_due_before_renewal
    CHECK (decision_due_date <= renewal_date),
  CONSTRAINT subscription_renewal_cases_resolution_shape
    CHECK (
      (status IN ('keep', 'wont_renew') AND decided_at IS NOT NULL)
      OR (status IN ('pending', 'reviewing') AND decided_at IS NULL)
    )
);

COMMENT ON TABLE public.subscription_renewal_cases IS
  'One auditable renewal decision per subscription billing occurrence. It does not represent payment or provider-side cancellation.';
COMMENT ON COLUMN public.subscription_renewal_cases.snoozed_until IS
  'Temporary attention suppression. Snooze does not change the canonical renewal status.';

CREATE INDEX IF NOT EXISTS subscription_renewal_cases_org_attention_idx
  ON public.subscription_renewal_cases (organization_id, status, decision_due_date);
CREATE INDEX IF NOT EXISTS subscription_renewal_cases_subscription_idx
  ON public.subscription_renewal_cases (subscription_id, renewal_date DESC);
CREATE INDEX IF NOT EXISTS subscription_renewal_cases_review_task_idx
  ON public.subscription_renewal_cases (review_task_id)
  WHERE review_task_id IS NOT NULL;

DROP TRIGGER IF EXISTS subscription_renewal_cases_set_updated_at ON public.subscription_renewal_cases;
CREATE TRIGGER subscription_renewal_cases_set_updated_at
  BEFORE UPDATE ON public.subscription_renewal_cases
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.record_subscription_renewal_case_created()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.domain_events (
      organization_id, workspace_id, event_name, aggregate_type,
      aggregate_id, payload, created_by
    ) VALUES (
      NEW.organization_id, NEW.workspace_id,
      'subscription.renewal_case.created', 'subscription', NEW.subscription_id,
      jsonb_build_object(
        'subscription_id', NEW.subscription_id,
        'renewal_case_id', NEW.id,
        'renewal_date', NEW.renewal_date,
        'decision_due_date', NEW.decision_due_date
      ),
      NEW.created_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_renewal_cases_record_created ON public.subscription_renewal_cases;
CREATE TRIGGER subscription_renewal_cases_record_created
  AFTER INSERT ON public.subscription_renewal_cases
  FOR EACH ROW EXECUTE FUNCTION public.record_subscription_renewal_case_created();

ALTER TABLE public.subscription_renewal_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_renewal_cases_select" ON public.subscription_renewal_cases;
CREATE POLICY "subscription_renewal_cases_select"
  ON public.subscription_renewal_cases FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "subscription_renewal_cases_insert" ON public.subscription_renewal_cases;
CREATE POLICY "subscription_renewal_cases_insert"
  ON public.subscription_renewal_cases FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_id
        AND s.organization_id = subscription_renewal_cases.organization_id
    )
  );

DROP POLICY IF EXISTS "subscription_renewal_cases_update" ON public.subscription_renewal_cases;
CREATE POLICY "subscription_renewal_cases_update"
  ON public.subscription_renewal_cases FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (
    public.can_write_data(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_id
        AND s.organization_id = subscription_renewal_cases.organization_id
    )
    AND (review_task_id IS NULL OR EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = review_task_id
        AND t.organization_id = subscription_renewal_cases.organization_id
    ))
    AND (cancellation_task_id IS NULL OR EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = cancellation_task_id
        AND t.organization_id = subscription_renewal_cases.organization_id
    ))
  );

DROP POLICY IF EXISTS "subscription_renewal_cases_delete" ON public.subscription_renewal_cases;
CREATE POLICY "subscription_renewal_cases_delete"
  ON public.subscription_renewal_cases FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));

-- Keep the current unresolved case aligned with next_billing_date. Resolved
-- cases remain immutable history; advancing the subscription creates a new one.
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
    PERFORM public.cancel_source_reminders(
      NEW.organization_id, 'subscription', NEW.id, 'renewal_decisions_disabled'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_sync_renewal_case ON public.subscriptions;
CREATE TRIGGER subscriptions_sync_renewal_case
  AFTER INSERT OR UPDATE OF next_billing_date, is_active, cancelled_at, auto_renews, renewal_reminder_days
  ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_renewal_case();

-- A renewal case projects exactly one renewal_required item for the owning
-- subscription. source_id intentionally remains the subscription id so the
-- existing Action Center routing/executor and notification infrastructure do
-- not mistake a renewal-case UUID for a subscription UUID.
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
    PERFORM public.cancel_source_reminders(
      NEW.organization_id, 'subscription', NEW.subscription_id, 'renewal_decision_resolved'
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

  PERFORM public.reschedule_subscription_reminders(NEW.subscription_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_renewal_cases_sync_attention ON public.subscription_renewal_cases;
CREATE TRIGGER subscription_renewal_cases_sync_attention
  AFTER INSERT OR UPDATE OF status, decision_due_date, renewal_date, snoozed_until,
    review_task_id, cancellation_task_id
  ON public.subscription_renewal_cases
  FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_renewal_attention();

-- Reuse the existing durable reminder worker. source_due_at stays anchored to
-- next_billing_date because the worker validates subscription reminders against
-- that source date, while scheduled_at follows the renewal decision policy.
CREATE OR REPLACE FUNCTION public.reschedule_subscription_reminders(p_subscription_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  s RECORD;
  c RECORD;
  v_source_due TIMESTAMPTZ;
  v_decision_at TIMESTAMPTZ;
  v_renewal_at TIMESTAMPTZ;
BEGIN
  SELECT id, organization_id, workspace_id, created_by AS recipient_user_id,
         next_billing_date, is_active, cancelled_at, auto_renews, renewal_reminder_days
    INTO s
  FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM public.cancel_source_reminders(
    s.organization_id, 'subscription', s.id, 'subscription_changed'
  );

  SELECT id, decision_due_date, renewal_date, status, snoozed_until
    INTO c
  FROM public.subscription_renewal_cases
  WHERE organization_id = s.organization_id
    AND subscription_id = s.id
    AND renewal_date = s.next_billing_date
  LIMIT 1;

  IF NOT s.is_active OR s.cancelled_at IS NOT NULL OR NOT s.auto_renews
     OR s.renewal_reminder_days IS NULL OR NOT FOUND
     OR c.status IN ('keep', 'wont_renew')
     OR s.recipient_user_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.memberships mb
       WHERE mb.organization_id = s.organization_id
         AND mb.user_id = s.recipient_user_id
         AND mb.status = 'active'
     ) THEN
    RETURN;
  END IF;

  v_source_due := public.reminder_execution_at(
    s.next_billing_date, s.recipient_user_id, s.organization_id
  );
  v_decision_at := public.reminder_execution_at(
    c.decision_due_date, s.recipient_user_id, s.organization_id
  );
  v_renewal_at := public.reminder_execution_at(
    c.renewal_date, s.recipient_user_id, s.organization_id
  );

  PERFORM public.enqueue_reminder(
    s.organization_id, s.workspace_id, s.recipient_user_id,
    'subscription', s.id, v_source_due, 'review-now', 'high',
    GREATEST(v_decision_at, now()),
    format('subscription-renewal:%s:%s:review:%s', s.id, s.recipient_user_id, c.id)
  );
  PERFORM public.enqueue_reminder(
    s.organization_id, s.workspace_id, s.recipient_user_id,
    'subscription', s.id, v_source_due, 'due-today', 'critical',
    v_renewal_at,
    format('subscription-renewal:%s:%s:renewal:%s', s.id, s.recipient_user_id, c.id)
  );
  PERFORM public.enqueue_reminder(
    s.organization_id, s.workspace_id, s.recipient_user_id,
    'subscription', s.id, v_source_due, 'overdue-plus-1d', 'critical',
    v_renewal_at + interval '1 day',
    format('subscription-renewal:%s:%s:overdue:%s', s.id, s.recipient_user_id, c.id)
  );
END;
$$;

-- The old trigger only watched payment dates. Renewal settings also affect the
-- durable schedule and must reschedule it.
DROP TRIGGER IF EXISTS subscriptions_reminder_schedule ON public.subscriptions;
CREATE TRIGGER subscriptions_reminder_schedule
  AFTER INSERT OR UPDATE OF next_billing_date, is_active, cancelled_at,
    auto_renews, renewal_reminder_days
  ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.reminder_domain_change_trigger();

-- The durable reminder worker is intentionally generic. Rewrite only the
-- delivery presentation when its linked action points at a live renewal case,
-- so notification copy and deep links lead back to the decision workflow.
CREATE OR REPLACE FUNCTION public.present_subscription_renewal_notification()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_subscription_id UUID;
  v_name TEXT;
BEGIN
  IF NEW.category <> 'subscription' OR NEW.action_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ai.primary_entity_id, s.name
    INTO v_subscription_id, v_name
  FROM public.action_items ai
  JOIN public.subscriptions s
    ON s.id = ai.primary_entity_id
   AND s.organization_id = ai.organization_id
  WHERE ai.id = NEW.action_item_id
    AND ai.organization_id = NEW.organization_id
    AND ai.primary_entity_type = 'subscription'
    AND EXISTS (
      SELECT 1 FROM public.subscription_renewal_cases c
      WHERE c.organization_id = ai.organization_id
        AND c.subscription_id = s.id
        AND c.renewal_date = s.next_billing_date
        AND c.status IN ('pending', 'reviewing')
    );

  IF v_subscription_id IS NOT NULL THEN
    NEW.title := 'Renewal decision: ' || v_name;
    NEW.body := 'Decide whether to keep, review, or stop this subscription before renewal.';
    NEW.target_url := '/subscriptions/' || v_subscription_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_present_subscription_renewal ON public.notifications;
CREATE TRIGGER notifications_present_subscription_renewal
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.present_subscription_renewal_notification();

-- Backfill a current case for every active tracked subscription. The attention
-- trigger above idempotently creates or upgrades the Action Center projection.
INSERT INTO public.subscription_renewal_cases (
  organization_id, workspace_id, subscription_id, renewal_date,
  decision_due_date, status, created_by
)
SELECT
  s.organization_id,
  s.workspace_id,
  s.id,
  s.next_billing_date,
  s.next_billing_date - s.renewal_reminder_days,
  'pending',
  s.created_by
FROM public.subscriptions s
WHERE s.is_active
  AND s.cancelled_at IS NULL
  AND s.auto_renews
  AND s.renewal_reminder_days IS NOT NULL
ON CONFLICT (organization_id, subscription_id, renewal_date) DO NOTHING;

REVOKE ALL ON FUNCTION public.sync_subscription_renewal_case() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_subscription_renewal_attention() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_subscription_renewal_case_created() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.present_subscription_renewal_notification() FROM PUBLIC, anon, authenticated;

COMMIT;
