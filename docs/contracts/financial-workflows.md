# Contract — Financial Workflows (confirm-first)

**Status:** Active · **Last verified:** 2026-07-08 (Phase A)
**Enforced by:** [`test/release-invariants.test.ts`](../../test/release-invariants.test.ts)

Nevora is **AI-assisted, not AI-controlled**. This document is the normative
contract for when money may be written. It is not aspirational — every clause
below is asserted by a test that fails the build if the clause is broken.

---

## 1. The invariants

| # | Invariant | Why it matters |
|---|---|---|
| F1 | An AI suggestion is **not** an accounting fact. | A model's guess must never become a ledger row. |
| F2 | Document detection is **not** a payment. | Reading "Invoice €200" ≠ €200 left the account. |
| F3 | Subscription **creation** is not an expense. | Signing up ≠ paying. |
| F4 | Subscription **attachment** (linking a doc) is not an expense. | Filing a receipt ≠ posting it. |
| F5 | Task **completion** is not payment. | "Done" is an operational state, not a financial one. |
| F6 | A **planned** obligation is not a posted transaction. | `status='planned'` rows are forecasts. |
| F7 | A posted transaction is created **only** by explicit user confirmation, or by an already-approved idempotent workflow. | Single door into the ledger. |
| F8 | Repeating the confirmation must **not** duplicate the transaction. | Double-click, retry, and refresh are all safe. |

## 2. The only two doors into the ledger

Every `money_transactions` row with `status='posted'` originates from exactly one of:

1. **Explicit user confirmation.**
   `createTransactionAction`, `confirmDocumentTransactionAction`,
   `postPlannedTransactionAction`, `createTransferAction`.
   The user saw the amount and pressed a button.

2. **An approved idempotent workflow.**
   `markSubscriptionPaymentAction` → `mark_subscription_payment_paid` RPC (078)
   `markFinancialTaskPaidAction` → `mark_financial_task_paid` RPC (079)
   Still user-initiated ("Mark as paid"), but the posting is atomic and replay-safe.

Nothing else. In particular **no cron, no AI job, and no event handler posts money.**
The daily `sweep-subscription-payment-workflow` is repair-only: it opens missing
planned cycles and missing payment tasks, and never marks anything paid.

## 3. How idempotency is guaranteed (F8)

`mark_subscription_payment_paid` is not "idempotent by convention" — it is
idempotent by three independent database mechanisms:

1. **Row lock.** The cycle is read `FOR UPDATE`, so two concurrent clicks serialize.
2. **Status guard.** `IF v_cycle.status = 'paid' THEN` returns
   `{already_paid: true}` with the *existing* `transaction_id`, creating nothing.
3. **Unique keys.** `UNIQUE (organization_id, idempotency_key)` and
   `UNIQUE (organization_id, subscription_id, billing_period_key)` on
   `subscription_payment_cycles` make a duplicate physically impossible even if
   (1) and (2) were bypassed.

The amount and currency are re-read **server-side** from the cycle/subscription.
They are never accepted from the client.

For one-off financial tasks, the equivalent guard is
`todos.financial_transaction_id` — non-null means already posted.

## 4. The canonical flow

```
Capture / Document / Subscription / Task
  → AI understands context            (suggestion, confidence-scored)
  → System prepares a reviewable action (draft / planned — NOT posted)
  → Action Center shows what needs attention
  → Human confirms / edits / rejects / snoozes
  → Existing module service executes  (the ONLY writer of business data)
  → Domain event records the change
  → Notifications, relations, analytics, AI context update
```

`planned` = draft. It appears in forecasts and in the Action Center. It is not in
the ledger until confirmed.

## 5. Language rules for UI, copy, and docs

AI **suggests**. The user **confirms**. A module service **executes**.

| Never say | Say instead |
|---|---|
| "AI posts your expenses" | "AI suggests a category; you confirm" |
| "Automatic accounting" | "Confirm-first financial workflows" |
| "Autonomous / fully automated business" | "AI-assisted, review-first" |
| "Payments are made automatically" | "Mark as paid when a payment has really happened" |
| "Detected → recorded" | "Detected → ready for your review" |

Landing and pricing copy are asserted against these rules in
[`shared/config/paused-modules.coverage.test.ts`](../../shared/config/paused-modules.coverage.test.ts).

## 6. Test coverage

Structural (runs in CI, no database needed):

- `test/release-invariants.test.ts` → F1–F8, by asserting on the live migration
  SQL and on module source.

Behavioural (must be exercised against a real database before release):

- `docs/release/smoke-test-checklist.md` §"Mark as paid idempotency".

Structural tests cannot prove runtime behaviour. They prove the *forbidden
construct is absent*, which is what regresses in practice.
