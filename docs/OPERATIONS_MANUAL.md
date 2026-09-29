# Operations Manual — Nevora Business OS

**Status:** Active · **Last updated:** 2026-09-29

The operator's index. Start here during an incident.

---

## What this product is

Nevora is **one workspace where small-business work arrives from anywhere** —
the app, Telegram, Slack, a forwarded email, a receipt — and becomes a task or
an expense draft. The user reviews and confirms before the system updates
business data.

Production: `bussines.nevorahq.com` on **Netlify** (site `nevora-business-os`).
If Netlify stops serving or deploying (the account was suspended once for
non-payment on 2026-09-28), crons stop too and merges to `main` do not deploy.

`/dashboard` is the **Action Center** — the primary operating screen. It answers
one question: *what needs my attention today?* It is **read-only**: it shows what
is outstanding and routes each item to its owning module (or Inbox Review for
capture-derived suggestions), but never mutates business data itself. Capture and
capture-derived review (edit / accept / reject) live in the **Inbox**.

## Non-negotiable invariants

If any of these is false in production, it is a release blocker.

**Financial** — see [`contracts/financial-workflows.md`](./contracts/financial-workflows.md)
- AI suggestion ≠ accounting fact. Document detection ≠ payment.
- Subscription creation ≠ expense. Subscription attachment ≠ expense.
- Task completion ≠ payment. Planned obligation ≠ posted transaction.
- Subscription "Mark as paid" ≠ expense: since migration `115` it records the
  payment in Subscriptions only.
- Posted transactions come only from an explicit confirmation in Finance or in a
  review surface. Repeating the confirmation never duplicates the row.

**Notifications** — see [`contracts/notification-lifecycle.md`](./contracts/notification-lifecycle.md)
- Read is not resolved. *Mark all as read* resolves nothing.

**Tenancy & access**
- Active organization is resolved **server-side**. Client `organization_id` is never trusted.
- RLS is the final database boundary.
- The service role is used only on session-less surfaces (cron, channel and
  billing webhooks, internal service routes) and the short list of in-session
  exceptions in [`ARCHITECTURE.md`](./ARCHITECTURE.md) — always scoped to a
  verified organization/user.
- Channel webhooks verify their signature before any work and accept only
  linked accounts.
- Background jobs using the service role are scoped, authenticated, idempotent, logged.

## Active vs paused scope

**Active:** Action Center (`/dashboard`), Inbox + channels (Telegram, Slack,
email forwarding), Tasks + Projects, Finance (Money, rules), Documents,
Subscriptions (payment cycles, renewal decisions, Gmail invoice import),
Settings, Members, Billing / Plans / Limits, Notifications, Relations,
Automation, Domain Events, Developer Access, Trial lifecycle.

**Reachable by URL only (not in navigation):** Dashboard Overview, Analytics, AI.

**Removed:** Financial Tasks (migration `115`).

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
| Moving a product to its standalone service | [tasks-cutover](./runbooks/tasks-cutover.md) · [subscriptions-cutover](./runbooks/subscriptions-cutover.md) · [finance-cutover](./runbooks/finance-cutover.md) |

There is no dedicated runbook for the capture channels yet. First checks: the
webhook path is in `MACHINE_ROUTES` (a 307 to `/login` means an old build or a
missing entry), the channel's secret is set in Netlify **and** a redeploy
happened after setting it, and the Telegram webhook is registered for the
current URL (`node scripts/telegram-set-webhook.mjs`).

## Release

| Doc | Use |
|---|---|
| [release-checklist](./release/release-checklist.md) | Before deploying. Includes go/no-go. |
| [smoke-test-checklist](./release/smoke-test-checklist.md) | After deploying, by a human. |
| [rollback-plan](./release/rollback-plan.md) | Strategy + decision table. |

## Database

- **Baseline in the tree:** migrations `000`–`125` (`054` is a known,
  intentional numbering gap). **Next free number: `126`.**
- **Applied on remote: `000`–`125`** (`125` confirmed 2026-09-29 by a read-only
  probe of `capture_project_rules`).
- A migration must be applied to remote **before** the deploy whose code depends
  on it — the schema must never trail the code.
- CI's `db` job applies every migration from scratch and runs the harnesses
  under `supabase/tests/` on every PR; the harnesses are negative-tested
  (reintroduce the bug and they fail).
- Migrations are applied **manually** by the maintainer; the Supabase CLI is not
  logged in and there is no automated `down`.
- Verify the baseline against the tree, never against a doc:
  ```sh
  ls supabase/migrations | tail -1
  ls supabase/migrations | sed 's/_.*//' | sort | uniq -d   # must be empty
  ```

## Cron

Eight fail-closed routes under `/api/cron/*`, each triggered by a Netlify
Scheduled Function in `netlify/functions/`: `reminders`, `extraction-sweep`,
`action-items-sweep`, `subscription-sweep`, `suggestions-sweep`, `trial-sweep`,
`purge-deleted-accounts`, `usage-reconcile`. No `CRON_SECRET` ⇒ 503; wrong
secret ⇒ 401. An unauthenticated 200 from any of them is a **P0**. Schedules,
owners and recovery: [`release/job-reliability-register.md`](./release/job-reliability-register.md).

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

- [ARCHITECTURE.md](./ARCHITECTURE.md) · [MODULE_STATUS.md](./MODULE_STATUS.md) · [ROADMAP.md](./ROADMAP.md) · [adr/](./adr/)
- [SECURITY.md](./SECURITY.md) · [security/SECURITY_TEST_MATRIX.md](./security/SECURITY_TEST_MATRIX.md)
- [contracts/domain-events.md](./contracts/domain-events.md)
- [observability/logging-and-errors.md](./observability/logging-and-errors.md)
