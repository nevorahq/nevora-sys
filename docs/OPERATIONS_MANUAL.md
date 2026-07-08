# Operations Manual — Nevora Business OS

**Status:** Active · **Last updated:** 2026-07-08 (Phase A)

The operator's index. Start here during an incident.

---

## What this product is

Nevora is an **AI-assisted operating desk for small businesses**. It turns
documents, subscriptions, payments, tasks and AI suggestions into a clear daily
action list. The user reviews and confirms important actions before the system
updates business data.

`/dashboard` is the **Action Center** — the primary operating screen. It answers
one question: *what needs my attention today?*

## Non-negotiable invariants

If any of these is false in production, it is a release blocker.

**Financial** — see [`contracts/financial-workflows.md`](./contracts/financial-workflows.md)
- AI suggestion ≠ accounting fact. Document detection ≠ payment.
- Subscription creation ≠ expense. Subscription attachment ≠ expense.
- Task completion ≠ payment. Planned obligation ≠ posted transaction.
- Posted transactions come only from explicit confirmation or an approved
  idempotent workflow. Repeating the confirmation never duplicates the row.

**Notifications** — see [`contracts/notification-lifecycle.md`](./contracts/notification-lifecycle.md)
- Read is not resolved. *Mark all as read* resolves nothing.

**Tenancy & access**
- Active organization is resolved **server-side**. Client `organization_id` is never trusted.
- RLS is the final database boundary.
- The service role must not appear in an interactive request handler.
- Background jobs using the service role are scoped, authenticated, idempotent, logged.

## Active vs paused scope

**Active:** Dashboard (Action Center), Action Center, Tasks, Projects, Financial
Tasks, Money, Money Intelligence, Documents, Subscriptions, Subscription Payment
Workflow, Capture Inbox, Settings, Members, Billing / Plans / Limits, Relations,
Notifications, Automation, Domain Events, Analytics, AI Assistant, Developer
Access, Trial lifecycle.

**Paused:** CRM, Leads, Clients, Deals, Contacts, Pipelines, Booking (including
its public surface).

Paused modules are gated server-side at three surfaces — pages, Server Actions,
and route handlers — by `shared/config/paused-modules.ts`. Hiding a nav link is
not a gate. Re-enable per environment with `NEVORA_ENABLE_CRM` /
`NEVORA_ENABLE_BOOKING`; both must be **unset in production**.

## Runbooks

| Symptom | Runbook |
|---|---|
| One org saw another's data | [suspected-tenant-leak](./runbooks/suspected-tenant-leak.md) — **P0, do not roll back first** |
| Entitlement disagrees with reality | [billing-subscription-mismatch](./runbooks/billing-subscription-mismatch.md) |
| Limit fires too early / never | [usage-counter-drift](./runbooks/usage-counter-drift.md) |
| Upload errors, hangs, or orphans | [document-upload-failure](./runbooks/document-upload-failure.md) |
| Document never reaches review | [extraction-job-stuck](./runbooks/extraction-job-stuck.md) |
| Obligation not on the dashboard | [missing-action-center-item](./runbooks/missing-action-center-item.md) |
| A scheduled job isn't running | [cron-failure](./runbooks/cron-failure.md) |
| Need to undo a release | [rollback](./runbooks/rollback.md) |

## Release

| Doc | Use |
|---|---|
| [release-checklist](./release/release-checklist.md) | Before deploying. Includes go/no-go. |
| [smoke-test-checklist](./release/smoke-test-checklist.md) | After deploying, by a human. |
| [rollback-plan](./release/rollback-plan.md) | Strategy + decision table. |

## Database

- **Baseline:** migrations `000`–`093`. **Next free number: `094`.**
- All of `000`–`093` are applied on remote (verified 2026-07-08).
- Migrations are applied **manually** by the maintainer; the Supabase CLI is not
  logged in and there is no automated `down`.
- Verify the baseline against the tree, never against a doc:
  ```sh
  ls supabase/migrations | tail -1
  ls supabase/migrations | sed 's/_.*//' | sort | uniq -d   # must be empty
  ```

## Cron

Five fail-closed routes: `reminders`, `extraction-sweep`, `subscription-sweep`,
`suggestions-sweep`, `trial-sweep`. No `CRON_SECRET` ⇒ 503; wrong secret ⇒ 401.
An unauthenticated 200 from any of them is a **P0**.

None of them post money.

## Gates

```sh
npm run typecheck && npm run lint && npm run test && npm run build
```

`test/release-invariants.test.ts` and
`shared/config/paused-modules.coverage.test.ts` encode the invariants above and
scan the source tree, so a newly added ungated surface fails CI. Do not relax
them — fix the code, or delete the block in the same PR that un-pauses a module.

## Related

- [ARCHITECTURE.md](./ARCHITECTURE.md) · [MODULE_STATUS.md](./MODULE_STATUS.md) · [ROADMAP.md](./ROADMAP.md)
- [SECURITY.md](./SECURITY.md) · [security/SECURITY_TEST_MATRIX.md](./security/SECURITY_TEST_MATRIX.md)
- [contracts/domain-events.md](./contracts/domain-events.md)
- [observability/logging-and-errors.md](./observability/logging-and-errors.md)
