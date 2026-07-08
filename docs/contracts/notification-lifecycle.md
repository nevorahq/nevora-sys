# Contract — Notification Lifecycle

**Status:** Active · **Last verified:** 2026-07-08 (Phase A)
**Enforced by:** [`test/release-invariants.test.ts`](../../test/release-invariants.test.ts)
**See also:** [`NOTIFICATION_POLICY.md`](../../NOTIFICATION_POLICY.md)

---

## The invariant

> **Read is not resolved.**

A notification is a *pointer* to something that happened. An obligation is a
*business state*. Dismissing the pointer does not change the state.

Marking a notification as read — individually or via **Mark all as read** — must
never resolve:

- an overdue task
- a payment obligation
- a subscription renewal
- a document review
- a billing or security warning
- an automation failure

## Why this is structurally true, not merely intended

Two independent facts hold this up:

**1. The read RPCs write to exactly one table.**
`mark_all_visible_notifications_read` and `mark_notification_read` (live
definitions: migrations 074 → 075) issue a single
`UPDATE public.notifications SET read_at = …`. They touch no other table.

**2. Attention counters are derived from business state, never from `read_at`.**
`get_notification_counters` computes `overdue` / `due_today` / `upcoming` by
querying the obligations themselves:

```sql
SELECT t.due_date FROM public.todos t             -- open tasks
UNION ALL SELECT s.next_billing_date FROM public.subscriptions s
UNION ALL SELECT x.transaction_date FROM public.money_transactions x
                 WHERE x.status = 'planned'
```

So an overdue task stays overdue after you read every notification in the
workspace. The unread badge goes to zero; the Action Center does not.

## The two independent lifecycles

| | Notification | Action item / obligation |
|---|---|---|
| **Means** | "something happened" | "something needs you" |
| **Ends when** | user reads it | user resolves the underlying business state |
| **State lives in** | `notifications.read_at` | `todos`, `subscriptions`, `money_transactions`, `action_items` |
| **Cleared by** | Mark as read | Confirm / pay / complete / dismiss the item |
| **Surface** | bell / toast / push | Action Center (`/dashboard`) |

An action item is resolved only through the Action Center's own transitions
(`resolve` / `dismiss` / `execute` / `snooze`), each of which writes
`action_items.status` and emits a domain event. `resolve` and `dismiss` are
distinct: dismiss means "not relevant", not "handled".

Snoozing hides an item until `snoozed_until`. It does not resolve it.

## Test coverage

`test/release-invariants.test.ts` resolves the **last** `CREATE OR REPLACE
FUNCTION` for each read RPC across all migrations (a later migration redefining
an earlier function is the realistic regression) and asserts the body writes to
no obligation table. Add any new obligation table to `OBLIGATION_TABLES` there.

Behavioural counterpart: `docs/release/smoke-test-checklist.md` §"Notification
read does not resolve business obligation".
