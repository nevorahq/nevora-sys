# Contract — Financial Workflows (confirm-first)

**Status:** Active · **Last verified:** 2026-09-29 (after migration `115`)
**Enforced by:** [`test/release-invariants.test.ts`](../../test/release-invariants.test.ts)

Nevora is **AI-assisted, not AI-controlled**. This document is the normative
contract for when money may be written. It is not aspirational — every clause
below is asserted by a test that fails the build if the clause is broken.

> The canonical financial-state vocabulary (`detected → needs_review → planned →
> due → paid | cancelled`) and the mapping of every per-surface status onto it
> live in [`financial-state-machine.md`](./financial-state-machine.md). This file
> covers *when* money may be written; that one covers *what state everything is in*.

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
| F7 | A posted transaction is created **only** by explicit user confirmation in Finance or in a review surface. | Single door into the ledger. |
| F8 | Repeating the confirmation must **not** duplicate the transaction. | Double-click, retry, and refresh are all safe. |

## 2. The single door into the ledger

Every `money_transactions` row with `status='posted'` originates from an
**explicit user confirmation** — the user saw the amount and pressed a button:

- **In Finance:** `createTransactionAction`, `postPlannedTransactionAction`,
  `createTransferAction`, `confirmDocumentTransactionAction`
  (`modules/moneyflow/actions/`).
- **In a review surface:** `confirmFinancialSuggestionRecord`
  (`modules/review/services/financial-suggestion.service.ts`) — reached from the
  Inbox / Documents review, including the receipt review dialog
  (`saveReviewedReceiptAction`).

Nothing else. In particular **no cron, no AI job, no channel webhook and no
event handler posts money.**

**Subscriptions and Tasks do not write to Money** (migration `115`, ADR 001).
The former second door — `mark_subscription_payment_paid` (`078`) and
`mark_financial_task_paid` (`079`), which posted an expense atomically on
"Mark as paid" — was dropped together with Financial Tasks. Marking a
subscription payment paid now records the fact on
`subscription_payment_cycles` only; a user who wants it in Finance records it
there. The daily `subscription-sweep` is repair-only: it opens missing planned
cycles and payment tasks, and never marks anything paid.

## 3. How idempotency is guaranteed (F8)

**Confirming a financial suggestion.** `confirmFinancialSuggestionRecord`
returns the existing `created_transaction_id` with `alreadyConfirmed: true`
when the suggestion is already confirmed, and refuses rejected ones — a second
click posts nothing. One document yields at most one posted transaction.

**Marking a subscription payment paid** (no money is posted, but the cycle must
not be settled twice). `markSubscriptionPaymentAsPaid`
(`modules/subtracker/services/mark-subscription-payment-as-paid.ts`) is guarded
three ways:

1. **Status guard.** A cycle already `paid` returns success without writing.
2. **Compare-and-set.** The UPDATE carries
   `.in("status", ["planned", "task_open"])`, so a concurrent pay/skip cannot
   both win.
3. **Unique keys.** `UNIQUE (organization_id, idempotency_key)` and
   `UNIQUE (organization_id, subscription_id, billing_period_key)` on
   `subscription_payment_cycles` (`078`) make a duplicate cycle impossible.

Amounts are never accepted from the client for either path — they come from
the stored suggestion or cycle.

## 4. The canonical flow

```
Capture / Document / Subscription / Task
  → AI understands context            (suggestion, confidence-scored)
  → System prepares a reviewable action (draft / planned — NOT posted)
  → Action Center shows what needs attention
  → Human confirms / edits / rejects / snoozes
  → Owning product/workflow service executes (the ONLY writer of business data)
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

- `test/release-invariants.test.ts` → F1–F8, by asserting on the migration SQL
  and on module source (subscription creation, document attachment, task
  completion, the subscription sweep and document extraction never insert into
  `money_transactions`; the mark-as-paid compare-and-set is present).

Behavioural (must be exercised against a real database before release):

- `docs/release/smoke-test-checklist.md` — document → confirm → exactly one
  transaction; subscription mark-as-paid twice → one paid cycle.

Structural tests cannot prove runtime behaviour. They prove the *forbidden
construct is absent*, which is what regresses in practice.
