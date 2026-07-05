-- ============================================================
-- Migration 078: Subscription Payment Workflow Automation
-- ============================================================
-- Turns subscriptions from a passive recurring-payment registry into a managed
-- payment workflow:
--
--   subscription -> payment cycle -> payment task -> (Mark as paid) -> expense
--   transaction -> subscription renewed -> next payment cycle -> next task
--
-- Core rule: creating a subscription NEVER creates a money transaction. A money
-- expense is created ONLY after an explicit "Mark as paid" action, and that
-- creation is idempotent.
--
-- This migration:
--   A. Extends public.subscriptions with recurrence/workflow columns.
--   B. Adds public.subscription_payment_cycles (per-period history + idempotency).
--   C. RLS (+ WITH CHECK) for the new table — org-scoped, never trusts client
--      organization_id.
--   D. mark_subscription_payment_paid() — a SECURITY DEFINER RPC that performs
--      the money-critical part of "Mark as paid" atomically.
--
-- Scheduling/period-key math lives in TypeScript (single source of truth,
-- unit-tested); the RPC only writes what the caller computed for the SAME
-- subscription, and re-reads amount/currency from the subscription row so the
-- posted amount can never be spoofed by the client.

BEGIN;

-- ============================================================
-- A. Extend subscriptions with recurrence / workflow fields
-- ============================================================
-- Existing columns already cover part of the spec:
--   billing_cycle      ~ billing_interval (weekly | monthly | yearly)
--   amount             ~ default_amount
--   currency, next_billing_date  — reused as-is
--   is_active          — active/paused flag (kept as the primary "generate
--                        future work?" gate; cancelled_at marks a terminal
--                        cancellation for analytics/audit).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_anchor_day    SMALLINT
    CHECK (billing_anchor_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS last_payment_date     DATE,
  ADD COLUMN IF NOT EXISTS default_category_id   UUID REFERENCES public.money_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method_hint   TEXT,
  ADD COLUMN IF NOT EXISTS auto_task_enabled     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_transaction_mode TEXT NOT NULL DEFAULT 'manual_confirm'
    CHECK (auto_transaction_mode IN ('manual_confirm', 'auto_post_on_task_complete')),
  ADD COLUMN IF NOT EXISTS cancelled_at          TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.billing_anchor_day IS
  'Day-of-month anchor for monthly/yearly recurrence (1..31). Next date keeps this day, clamped to end-of-month. NULL = derive from next_billing_date.';
COMMENT ON COLUMN public.subscriptions.last_payment_date IS
  'Date of the most recent confirmed (paid) cycle. Set by mark_subscription_payment_paid.';
COMMENT ON COLUMN public.subscriptions.default_category_id IS
  'Money category applied to the expense transaction created on Mark as paid.';
COMMENT ON COLUMN public.subscriptions.auto_transaction_mode IS
  'manual_confirm = expense created only via explicit Mark as paid (default). auto_post_on_task_complete reserved; auto_post_on_due_date is intentionally NOT supported.';
COMMENT ON COLUMN public.subscriptions.cancelled_at IS
  'Terminal cancellation timestamp. Cancelled subscriptions generate no future cycles/tasks (is_active is also set false).';

-- Anchor backfill: existing rows adopt the day of their current next_billing_date.
UPDATE public.subscriptions
  SET billing_anchor_day = EXTRACT(DAY FROM next_billing_date)::smallint
  WHERE billing_anchor_day IS NULL;


-- ============================================================
-- B. subscription_payment_cycles
-- ============================================================
-- One row per billing period. Connects subscription -> cycle -> task ->
-- transaction, preserving per-period history, idempotency and audit context.
CREATE TABLE IF NOT EXISTS public.subscription_payment_cycles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id       UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  subscription_id    UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,

  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  due_date           DATE NOT NULL,
  billing_period_key TEXT NOT NULL,

  expected_amount    NUMERIC(14, 2) NOT NULL CHECK (expected_amount > 0),
  currency           TEXT NOT NULL,

  status             TEXT NOT NULL DEFAULT 'planned'
                       CHECK (status IN ('planned', 'task_open', 'paid', 'skipped', 'failed', 'cancelled')),

  task_id            UUID REFERENCES public.todos(id)              ON DELETE SET NULL,
  transaction_id     UUID REFERENCES public.money_transactions(id) ON DELETE SET NULL,
  document_id        UUID REFERENCES public.documents(id)          ON DELETE SET NULL,

  idempotency_key    TEXT NOT NULL,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at            TIMESTAMPTZ,
  skipped_at         TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,

  -- Each billing period exists at most once per subscription.
  CONSTRAINT subscription_payment_cycles_period_key_uniq
    UNIQUE (organization_id, subscription_id, billing_period_key),
  -- Idempotency envelope for the whole cycle (planned + its expense).
  CONSTRAINT subscription_payment_cycles_idempotency_uniq
    UNIQUE (organization_id, idempotency_key),
  -- Enables org-checked composite FKs from future tables.
  CONSTRAINT subscription_payment_cycles_id_org_uniq
    UNIQUE (id, organization_id)
);

COMMENT ON TABLE public.subscription_payment_cycles IS
  'Per-period payment lifecycle for a subscription. Source of truth for idempotent Mark-as-paid, payment history, analytics and AI context.';
COMMENT ON COLUMN public.subscription_payment_cycles.billing_period_key IS
  'Stable human/period key, e.g. 2026-07 (monthly), 2026 (yearly), 2026-W28 (weekly). Unique per subscription.';
COMMENT ON COLUMN public.subscription_payment_cycles.idempotency_key IS
  'subscription:{sub}:cycle:{period_key} — guarantees one cycle (and one expense) per period even under retries.';
COMMENT ON COLUMN public.subscription_payment_cycles.status IS
  'planned -> task_open -> paid | skipped | cancelled. failed reserved for future auto-post errors.';

-- At most one still-open cycle (planned or task_open) per subscription, so tasks
-- never pile up. Terminal states (paid/skipped/cancelled/failed) are unbounded.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payment_cycles_one_open_idx
  ON public.subscription_payment_cycles (subscription_id)
  WHERE status IN ('planned', 'task_open');

CREATE INDEX IF NOT EXISTS subscription_payment_cycles_org_idx          ON public.subscription_payment_cycles (organization_id);
CREATE INDEX IF NOT EXISTS subscription_payment_cycles_workspace_idx    ON public.subscription_payment_cycles (workspace_id);
CREATE INDEX IF NOT EXISTS subscription_payment_cycles_subscription_idx ON public.subscription_payment_cycles (subscription_id);
CREATE INDEX IF NOT EXISTS subscription_payment_cycles_task_idx         ON public.subscription_payment_cycles (task_id)        WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_payment_cycles_transaction_idx  ON public.subscription_payment_cycles (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_payment_cycles_due_date_idx     ON public.subscription_payment_cycles (organization_id, due_date);
CREATE INDEX IF NOT EXISTS subscription_payment_cycles_status_idx       ON public.subscription_payment_cycles (organization_id, status);
CREATE INDEX IF NOT EXISTS subscription_payment_cycles_period_key_idx   ON public.subscription_payment_cycles (billing_period_key);

-- updated_at maintenance (reuses the shared trigger function from 000).
DROP TRIGGER IF EXISTS set_updated_at ON public.subscription_payment_cycles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.subscription_payment_cycles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- C. RLS — org-scoped, WITH CHECK on every write
-- ============================================================
ALTER TABLE public.subscription_payment_cycles ENABLE ROW LEVEL SECURITY;

-- SELECT: any active member of the owning org.
DROP POLICY IF EXISTS "spc_select" ON public.subscription_payment_cycles;
CREATE POLICY "spc_select" ON public.subscription_payment_cycles
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT: writer roles only; created_by pinned to the caller; the parent
-- subscription and any linked task/transaction/document must live in the SAME
-- org (defense in depth against cross-tenant stitching / mass assignment).
DROP POLICY IF EXISTS "spc_insert" ON public.subscription_payment_cycles;
CREATE POLICY "spc_insert" ON public.subscription_payment_cycles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_data(organization_id)
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_id
        AND s.organization_id = subscription_payment_cycles.organization_id
    )
    AND (task_id IS NULL OR EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id AND t.organization_id = subscription_payment_cycles.organization_id
    ))
    AND (transaction_id IS NULL OR EXISTS (
      SELECT 1 FROM public.money_transactions m
      WHERE m.id = transaction_id AND m.organization_id = subscription_payment_cycles.organization_id
    ))
    AND (document_id IS NULL OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.organization_id = subscription_payment_cycles.organization_id
    ))
  );

-- UPDATE: writer roles; subscription stays in-org; linked rows stay in-org.
DROP POLICY IF EXISTS "spc_update" ON public.subscription_payment_cycles;
CREATE POLICY "spc_update" ON public.subscription_payment_cycles
  FOR UPDATE TO authenticated
  USING (public.can_write_data(organization_id))
  WITH CHECK (
    public.can_write_data(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_id
        AND s.organization_id = subscription_payment_cycles.organization_id
    )
    AND (task_id IS NULL OR EXISTS (
      SELECT 1 FROM public.todos t
      WHERE t.id = task_id AND t.organization_id = subscription_payment_cycles.organization_id
    ))
    AND (transaction_id IS NULL OR EXISTS (
      SELECT 1 FROM public.money_transactions m
      WHERE m.id = transaction_id AND m.organization_id = subscription_payment_cycles.organization_id
    ))
    AND (document_id IS NULL OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.organization_id = subscription_payment_cycles.organization_id
    ))
  );

-- DELETE: manager+ only. Cycles are history — deletion is rare (admin cleanup).
DROP POLICY IF EXISTS "spc_delete" ON public.subscription_payment_cycles;
CREATE POLICY "spc_delete" ON public.subscription_payment_cycles
  FOR DELETE TO authenticated
  USING (public.can_delete_data(organization_id));


-- ============================================================
-- D. mark_subscription_payment_paid() — atomic Mark-as-paid core
-- ============================================================
-- Runs the money-critical steps in ONE database transaction:
--   1. authz + tenant guards
--   2. lock cycle, enforce idempotency (already paid -> no-op, returns existing)
--   3. create the expense transaction (amount/currency read from subscription)
--   4. mark cycle paid + link transaction
--   5. complete the payment task
--   6. advance subscription (last/next payment date)
--   7. create the NEXT planned cycle (schedule computed by caller)
--
-- Entity-links, domain events, audit logs and the next payment TASK are created
-- by the caller AFTER this returns — they are best-effort and repairable, and
-- must not hold a money transaction open. The schedule inputs (period key/dates)
-- are for the same subscription only and carry no cross-tenant authority; the
-- posted amount and currency are re-read server-side and cannot be spoofed.
CREATE OR REPLACE FUNCTION public.mark_subscription_payment_paid(
  p_organization_id       UUID,
  p_cycle_id              UUID,
  p_account_id            UUID,
  p_paid_date             DATE,
  p_transaction_title     TEXT,
  p_next_billing_period_key TEXT,
  p_next_period_start     DATE,
  p_next_period_end       DATE,
  p_next_due_date         DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cycle        public.subscription_payment_cycles%ROWTYPE;
  v_sub          public.subscriptions%ROWTYPE;
  v_tx_id        UUID;
  v_next_cycle_id UUID;
  v_paid         DATE := COALESCE(p_paid_date, current_date);
  v_cat_source   TEXT;
  v_cat_status   TEXT;
BEGIN
  -- 1. Authz + tenant guard.
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_write_data(p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock the cycle (serializes concurrent double-clicks) and scope to org.
  SELECT * INTO v_cycle
  FROM public.subscription_payment_cycles
  WHERE id = p_cycle_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: a paid cycle returns its existing transaction, no new writes.
  IF v_cycle.status = 'paid' THEN
    RETURN jsonb_build_object(
      'already_paid', true,
      'cycle_id', v_cycle.id,
      'transaction_id', v_cycle.transaction_id,
      'task_id', v_cycle.task_id,
      'next_cycle_id', NULL
    );
  END IF;

  IF v_cycle.status NOT IN ('planned', 'task_open') THEN
    RAISE EXCEPTION 'cycle_not_payable' USING ERRCODE = 'P0001',
      DETAIL = format('status=%s', v_cycle.status);
  END IF;

  -- Load the parent subscription (amount/currency are authoritative here).
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE id = v_cycle.subscription_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Verify the paying account belongs to the same org.
  IF NOT EXISTS (
    SELECT 1 FROM public.money_accounts a
    WHERE a.id = p_account_id AND a.organization_id = p_organization_id AND a.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'account_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Create the expense transaction. A default category means a confirmed,
  --    system-attributed categorization; otherwise it enters the normal
  --    uncategorized queue.
  IF v_sub.default_category_id IS NOT NULL THEN
    v_cat_source := 'system';
    v_cat_status := 'confirmed';
  ELSE
    v_cat_source := NULL;
    v_cat_status := 'uncategorized';
  END IF;

  INSERT INTO public.money_transactions (
    organization_id, workspace_id, created_by, updated_by,
    account_id, category_id, category_source, categorization_status,
    type, status, amount, currency, transaction_date, title
  ) VALUES (
    p_organization_id, v_cycle.workspace_id, auth.uid(), auth.uid(),
    p_account_id, v_sub.default_category_id, v_cat_source, v_cat_status,
    'expense', 'posted', v_cycle.expected_amount, v_cycle.currency, v_paid,
    COALESCE(NULLIF(btrim(p_transaction_title), ''), v_sub.name)
  )
  RETURNING id INTO v_tx_id;

  -- 4. Mark cycle paid + link the transaction.
  UPDATE public.subscription_payment_cycles
  SET status = 'paid',
      transaction_id = v_tx_id,
      paid_at = now()
  WHERE id = v_cycle.id;

  -- 5. Complete the payment task (status is source of truth; is_completed synced).
  IF v_cycle.task_id IS NOT NULL THEN
    UPDATE public.todos
    SET status = 'done', is_completed = true, updated_by = auth.uid()
    WHERE id = v_cycle.task_id AND organization_id = p_organization_id;
  END IF;

  -- 6. Advance the subscription schedule.
  UPDATE public.subscriptions
  SET last_payment_date = v_paid,
      next_billing_date = p_next_due_date,
      updated_by = auth.uid()
  WHERE id = v_sub.id AND organization_id = p_organization_id;

  -- 7. Create the next planned cycle — only while the subscription keeps
  --    generating work. ON CONFLICT keeps this idempotent across retries.
  IF v_sub.is_active AND v_sub.cancelled_at IS NULL AND v_sub.auto_task_enabled THEN
    INSERT INTO public.subscription_payment_cycles (
      organization_id, workspace_id, subscription_id,
      period_start, period_end, due_date, billing_period_key,
      expected_amount, currency, status, idempotency_key, created_by
    ) VALUES (
      p_organization_id, v_cycle.workspace_id, v_sub.id,
      p_next_period_start, p_next_period_end, p_next_due_date, p_next_billing_period_key,
      v_sub.amount, v_sub.currency, 'planned',
      format('subscription:%s:cycle:%s', v_sub.id, p_next_billing_period_key),
      auth.uid()
    )
    ON CONFLICT (organization_id, subscription_id, billing_period_key) DO NOTHING
    RETURNING id INTO v_next_cycle_id;

    IF v_next_cycle_id IS NULL THEN
      SELECT id INTO v_next_cycle_id
      FROM public.subscription_payment_cycles
      WHERE organization_id = p_organization_id
        AND subscription_id = v_sub.id
        AND billing_period_key = p_next_billing_period_key;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'already_paid', false,
    'cycle_id', v_cycle.id,
    'transaction_id', v_tx_id,
    'task_id', v_cycle.task_id,
    'next_cycle_id', v_next_cycle_id,
    'next_due_date', p_next_due_date,
    'workspace_id', v_cycle.workspace_id,
    'subscription_id', v_sub.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_subscription_payment_paid(UUID, UUID, UUID, DATE, TEXT, TEXT, DATE, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_subscription_payment_paid(UUID, UUID, UUID, DATE, TEXT, TEXT, DATE, DATE, DATE) TO authenticated;

COMMIT;
