# Financial state machine contract (Sprint 4 — S4.2)

**Status:** Canonical vocabulary for every money-bearing lifecycle. This is a
**mapping** contract, not a schema change: the database keeps its existing status
columns; this doc defines the single canonical vocabulary they all map onto, so
UI and reasoning are consistent across surfaces. **No column is renamed.**

Companion docs: [`financial-workflows.md`](./financial-workflows.md),
[`attention-model.md`](./attention-model.md),
[`../../NOTIFICATION_POLICY.md`](../../NOTIFICATION_POLICY.md).

The per-surface states below are asserted against the migration CHECK constraints
by `test/financial-state-contract.test.ts`, so a new DB state forces a contract
update.

---

## 1. Canonical states

```text
detected → needs_review → planned → due → paid | cancelled
```

| Canonical | Means | A financial fact? | A posted transaction? |
|---|---|---|---|
| **detected** | A signal was found (AI/extraction) — a candidate, nothing more | No | No |
| **needs_review** | Awaiting explicit human classification/confirmation | No | No |
| **planned** | A planned obligation exists (future/expected) | No | No |
| **due** | The obligation is now owed (its date has arrived / a payment task is open) | No | No |
| **paid** | A posted `money_transactions` row exists — money actually moved | **Yes** | **Yes** |
| **cancelled** | Terminal without payment (rejected / skipped / dismissed / cancelled) | No | No |

**Only `paid` is a posted transaction.** The transition into `paid` happens ONLY
through an explicit, authorized, idempotent workflow (user confirm, or
`mark_subscription_payment_paid` / `mark_financial_task_paid` /
`confirmFinancialSuggestion`). Nothing else posts money.

---

## 2. Per-surface mapping (DB status → canonical)

### `money_transactions.status` (migration 041)
| DB value | Canonical |
|---|---|
| `planned` | planned |
| `posted` | **paid** (the ledger fact) |

### `subscription_payment_cycles.status` (migration 078)
| DB value | Canonical |
|---|---|
| `planned` | planned |
| `task_open` | due |
| `paid` | **paid** |
| `failed` | due (still owed; a payment attempt failed) |
| `skipped` | cancelled |
| `cancelled` | cancelled |

A `planned` cycle whose `due_date` has arrived resolves to **due** — §1 defines
`due` as "its date has arrived / a payment task is open", and the task-generating
sweep may not have run yet. This is a **label** derivation only: no DB status is
rewritten, and it never turns anything into `paid`.

### `todos.financial_status` (migration 079)
| DB value | Canonical |
|---|---|
| `open` | planned → due (by `financial_due_date`) |
| `paid` | **paid** |
| `skipped` | cancelled |
| `dismissed` | cancelled |

### `financial_suggestions.review_state` (migration 097)
| DB value | Canonical |
|---|---|
| `detected` | detected |
| `suggested` | needs_review |
| `waiting_confirmation` | needs_review |
| `confirmed` | exits the review machine → becomes a `planned`/`paid` obligation |
| `rejected` | cancelled |

The `review_state` transitions are already enforced by a DB trigger (097):
`detected → suggested → waiting_confirmation → confirmed | rejected`.

### `document_extractions.status` (migration 051) — **upstream, not a financial state**
`pending / processing / completed / failed / needs_review` are **ingestion job**
states, not money states. A completed extraction *produces* a
`financial_suggestion` at `detected`; a failed one surfaces as a `risk_detected`
action item (attention-model §5). Extraction status never means money moved.

---

## 3. Invariants (must never break)

- **detected / needs_review are not a financial fact.** A suggestion is a
  candidate; it posts nothing.
- **planned / due are not a posted transaction.** An obligation is owed, not paid.
- **Only an approved transition creates `paid`** — an explicit user confirm or an
  already-approved idempotent RPC. Repeat clicks and concurrent requests must not
  create a second `paid` transaction (see idempotency keys in 078/079, exactly-once
  indexes in 099).
- **Task completion ≠ payment.** `todos.status = 'done'` does not imply
  `financial_status = 'paid'`; the two are independent columns.
- **Document attachment ≠ expense.** Linking a document posts no transaction.
- **Subscription creation / attachment ≠ expense.** Only `mark ... paid` posts.
- **One obligation → one posted transaction.** Enforced by the per-source
  idempotency keys, not re-derived per click.
- **Historical posted values are immutable.** A `paid` transaction keeps the
  amount and FX rate captured at posting time; current organization exchange
  rates (migration 107) never rewrite a posted row.

---

## 4. Where each canonical state lives (for the Money workspace)

| Canonical | Primary surface |
|---|---|
| detected / needs_review | Capture Inbox + Documents review (financial_suggestions) |
| planned | Money → planned obligations (planned transactions, open cycles/tasks) |
| due | Money → Financial Tasks + subscription cycles due |
| paid | Money → Transactions ledger (posted) |
| cancelled | terminal — retained for history, not shown as attention |

Sprint 4 unit 4.3 unifies these under one Money workspace; the vocabulary here is
what every tab and label must use (unit 4.4).

**Unit 4.4 rollout (done).** The mapping lives in
`modules/moneyflow/lib/canonical-financial-state.ts` and is rendered by the single
`FinancialStateBadge` component, whose labels always come from `dict.money.states`
(en/ru/ro). Converted surfaces: subscription payment workflow panel, subscription
payment task panel, subscription suggestion panel, subscription list item,
financial task panel, document extraction review. The competing hardcoded
`REVIEW_STATE_LABELS` map was deleted, as were the `financialTask.status*`
dictionary keys. `modules/moneyflow/components/financial-state-badge.test.tsx`
fails if a surface reintroduces its own vocabulary.
