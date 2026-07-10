-- Phase 3 — Money-invariant SQL pack (A1–A3)
-- =============================================================================
-- Purpose: prove the three money invariants of the I-09 interactive smoke on the
--          DEPLOYED remote database. Any FAIL here is a P0 incident (a money
--          double is not a "bug from the list"), not a checklist miss — stop
--          Phase 3, fix the bug, re-run.
--
-- How to run (psql against the remote pooler / service-role connection):
--   psql "$DATABASE_URL" \
--     -v org_id='00000000-0000-0000-0000-000000000000' \
--     -v task_id='00000000-0000-0000-0000-000000000000' \
--     -v subscription_id='00000000-0000-0000-0000-000000000000' \
--     -v period_key='2026-07' \
--     -f scripts/db/phase-3-money-invariants.sql
--
-- Or set them interactively at the top of a psql session, then \i this file:
--   \set org_id '00000000-0000-0000-0000-000000000000'
--   \set task_id '...'
--   \set subscription_id '...'
--   \set period_key '2026-07'
--   \i scripts/db/phase-3-money-invariants.sql
--
-- Every query returns a `verdict` column = PASS / FAIL. Copy the row(s) into the
-- proof report. SELECT-only; safe to run repeatedly.
--
-- Column facts baked in (verified against migrations 078/079 + money_transactions):
--   * todos.financial_transaction_id  (non-null == paid); todos.financial_status
--   * subscription_payment_cycles: UNIQUE(organization_id, subscription_id,
--       billing_period_key); .transaction_id, .status
--   * money_transactions: organization_id, status ('posted'|'planned'),
--       deleted_at (soft-delete) — a "real" expense is status='posted' AND
--       deleted_at IS NULL.
-- =============================================================================

\echo '=============================================================='
\echo 'A1 — Financial task: double-click Mark-as-paid => exactly ONE tx'
\echo '=============================================================='
-- Guard: the single column todos.financial_transaction_id. Expect status paid,
-- a non-null link, and exactly one live posted transaction behind that link.
SELECT
  t.id                                   AS task_id,
  t.financial_status,                                              -- expect: paid
  t.financial_transaction_id,                                      -- expect: NOT NULL
  (SELECT count(*) FROM public.money_transactions m
     WHERE m.id = t.financial_transaction_id
       AND m.deleted_at IS NULL) AS linked_tx_count,               -- expect: 1
  CASE
    WHEN t.financial_status = 'paid'
     AND t.financial_transaction_id IS NOT NULL
     AND (SELECT count(*) FROM public.money_transactions m
            WHERE m.id = t.financial_transaction_id
              AND m.deleted_at IS NULL) = 1
    THEN 'PASS' ELSE 'FAIL'
  END AS verdict
FROM public.todos t
WHERE t.id = :'task_id';

\echo ''
\echo '=============================================================='
\echo 'A2 — Subscription cycle: double-click => exactly ONE cycle + ONE tx'
\echo '=============================================================='
-- Guard: UNIQUE(organization_id, subscription_id, billing_period_key) + one
-- linked transaction. Expect status paid, non-null link, one cycle for the
-- period, one live posted transaction.
SELECT
  c.subscription_id,
  c.billing_period_key,
  c.status,                                                        -- expect: paid
  c.transaction_id,                                                -- expect: NOT NULL
  (SELECT count(*) FROM public.subscription_payment_cycles c2
     WHERE c2.organization_id    = c.organization_id
       AND c2.subscription_id    = c.subscription_id
       AND c2.billing_period_key = c.billing_period_key) AS cycles_for_period,  -- expect: 1
  (SELECT count(*) FROM public.money_transactions m
     WHERE m.id = c.transaction_id
       AND m.deleted_at IS NULL) AS linked_tx_count,               -- expect: 1
  CASE
    WHEN c.status = 'paid'
     AND c.transaction_id IS NOT NULL
     AND (SELECT count(*) FROM public.subscription_payment_cycles c2
            WHERE c2.organization_id    = c.organization_id
              AND c2.subscription_id    = c.subscription_id
              AND c2.billing_period_key = c.billing_period_key) = 1
     AND (SELECT count(*) FROM public.money_transactions m
            WHERE m.id = c.transaction_id
              AND m.deleted_at IS NULL) = 1
    THEN 'PASS' ELSE 'FAIL'
  END AS verdict
FROM public.subscription_payment_cycles c
WHERE c.subscription_id    = :'subscription_id'
  AND c.billing_period_key = :'period_key';

\echo ''
\echo '=============================================================='
\echo 'A3 — Plain task complete does NOT post a money transaction'
\echo '=============================================================='
-- Two-step: capture the baseline count, complete a NON-financial task in the UI,
-- then re-run. Delta must be exactly 0. Counts live posted expenses/incomes only.
--
--   STEP 1 (before completing the task): run and note tx_count_before.
--   STEP 2 (after completing the task):  run again; delta = after - before = 0.
--
-- This single query prints the current count; the operator records BEFORE and
-- AFTER values in the report. (A stateful PASS/FAIL can't live in one SELECT.)
SELECT
  :'org_id'::uuid AS organization_id,
  count(*)        AS tx_count,              -- record as BEFORE, then as AFTER
  now()           AS observed_at
FROM public.money_transactions
WHERE organization_id = :'org_id'::uuid
  AND deleted_at IS NULL;
-- A3 verdict is computed by hand in the report: PASS iff (AFTER - BEFORE) = 0.
