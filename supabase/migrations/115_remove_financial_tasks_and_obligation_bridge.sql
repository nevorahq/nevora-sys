-- ============================================================
-- Migration 115: Remove Financial Tasks and the Money obligation bridge
-- ============================================================
-- Product decision: Tasks, Money and Subscriptions no longer bridge to each
-- other. Financial Context Tasks (migration 079) are removed entirely — Tasks
-- reverts to a plain to-do list. Subscriptions keeps its own "mark as paid"
-- (subscription_payment_cycles.status), but that mutation no longer posts a
-- Money transaction — see modules/subtracker/services/mark-subscription-
-- payment-as-paid.ts, a plain guarded UPDATE, not a SECURITY DEFINER RPC.
--
-- This migration:
--   A. Drops mark_financial_task_paid() (079) and mark_subscription_payment_
--      paid() (078) — both existed only to atomically post a Money
--      transaction from Tasks/Subscriptions, which no caller does anymore.
--   B. Drops the financial-context columns/indexes/constraint added to
--      public.todos by migration 079.
--   C. Recreates task_smart_list (061) so t.* stops expanding into the
--      dropped columns.
--
-- subscription_payment_cycles (078) is UNCHANGED: Subscriptions still owns its
-- native payment-cycle schedule, and Money's transaction detail page still
-- reads subscription_payment_cycles.transaction_id to show which subscription
-- a historical transaction settled (a read-only informational link, not a
-- money-posting mechanism) — see platform/subscriptions/server.ts.
--
-- PRECONDITION — run before applying, this is a destructive column drop:
--   SELECT count(*) FROM todos WHERE task_context_type <> 'standard';
-- If that returns > 0, those rows carry real financial-task data (amount,
-- due date, payment status) that this migration permanently discards.

BEGIN;

-- ============================================================
-- A. Drop the Mark-as-paid RPCs
-- ============================================================
DROP FUNCTION IF EXISTS public.mark_financial_task_paid(UUID, UUID, UUID, DATE, UUID, TEXT);
DROP FUNCTION IF EXISTS public.mark_subscription_payment_paid(UUID, UUID, UUID, DATE, TEXT, TEXT, DATE, DATE, DATE);

-- ============================================================
-- B. Drop Financial Context columns from todos (migration 079)
-- ============================================================
ALTER TABLE public.todos
  DROP CONSTRAINT IF EXISTS todos_financial_context_consistency;

DROP INDEX IF EXISTS public.todos_financial_tasks_idx;
DROP INDEX IF EXISTS public.todos_financial_source_uniq;

ALTER TABLE public.todos
  DROP COLUMN IF EXISTS task_context_type,
  DROP COLUMN IF EXISTS financial_due_date,
  DROP COLUMN IF EXISTS reminder_offset_days,
  DROP COLUMN IF EXISTS amount,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS provider_name,
  DROP COLUMN IF EXISTS financial_source_type,
  DROP COLUMN IF EXISTS financial_source_id,
  DROP COLUMN IF EXISTS source_document_id,
  DROP COLUMN IF EXISTS financial_transaction_id,
  DROP COLUMN IF EXISTS financial_status,
  DROP COLUMN IF EXISTS financial_confidence,
  DROP COLUMN IF EXISTS financial_paid_at,
  DROP COLUMN IF EXISTS financial_skipped_at;

-- ============================================================
-- C. Recreate task_smart_list so t.* stops expanding into the dropped columns
-- ============================================================
DROP VIEW IF EXISTS public.task_smart_list;
CREATE VIEW public.task_smart_list
  WITH (security_invoker = true)
  AS
SELECT
  t.*,
  CASE
    WHEN t.is_closed = 0
      AND t.due_date IS NOT NULL
      AND t.due_date < CURRENT_DATE
    THEN 0
    ELSE 1
  END                AS sort_overdue,
  p.name             AS project_name,
  p.color            AS project_color,
  p.status           AS project_status
FROM public.todos t
LEFT JOIN public.projects p ON p.id = t.project_id;

COMMENT ON VIEW public.task_smart_list IS
  'Read-only sortable projection of todos. security_invoker: inherits todos/projects RLS. sort_overdue=0 for active overdue tasks.';

GRANT SELECT ON public.task_smart_list TO authenticated;

COMMIT;
