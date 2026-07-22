# Launch readiness snapshot — 2026-07-22

**Purpose:** the engineering half of the launch gate, filled with real evidence.
The **safety gate** below is verified now (every row is backed by a test that
passes). The **activation gate** and the **launch decision** remain product-owner
work — run the controlled beta, then fill
[`launch-gate-checklist.md`](./launch-gate-checklist.md) §2 and the
[decision record](./launch-decision-record-TEMPLATE.md).

| | |
|---|---|
| Commit | `76d2430` |
| Migration baseline | `000`–`112` applied on remote (maintainer-confirmed 2026-07-22) |
| Billing mode | private beta (no Paddle runtime; Request-access CTAs) |
| Test evidence | `531` tests across the 11 safety-gate files, all passing (this snapshot) |

---

## 1. Safety gate — VERIFIED ✅ (engineering, this commit)

Every row ran green in this snapshot (`vitest run` over the cited files):

| Safety area | Backing test | Status |
|---|---|---|
| Confirm-first money (nothing posts implicitly) | `test/release-invariants.test.ts` | ✅ |
| Mark-as-paid idempotent (subscription + financial task) | `test/release-invariants.test.ts` | ✅ |
| Canonical financial states | `test/financial-state-contract.test.ts` | ✅ |
| Notification read ≠ resolved | `test/release-invariants.test.ts` | ✅ |
| Attention model canonical | `test/attention-model-contract.test.ts` | ✅ |
| Mandatory notification not hideable | `modules/notifications/delivery/notification-mandatory.test.ts` | ✅ |
| AI cannot act on its own | `test/ai-governance.test.ts` | ✅ |
| Analytics/events carry no secrets | `test/analytics-privacy.test.ts` | ✅ |
| Tenant isolation / cross-org safe-not-found | `lib/security/require-app-access.test.ts`, `lib/entity-links/verify-entity-organization.test.ts` | ✅ |
| CRM/Booking fail closed | `shared/config/paused-modules.coverage.test.ts` | ✅ |
| Background jobs registered (auth/retry/terminal/owner) | `test/job-reliability-register.test.ts` | ✅ |
| Launch gate stays wired to the above | `test/launch-gate.test.ts` | ✅ |

**Verdict:** the hard safety gate is GREEN at `76d2430`. No open P0/P1 on release
safety in code.

---

## 2. Operational prerequisites (deploy — confirm on Netlify)

**Environment variables** (Netlify env; the app fails closed without them):

| Var | Purpose | Required |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | cron sweeps + internal metrics (cross-org) | yes |
| `CRON_SECRET` | gates all `/api/cron/*` | yes |
| `METRICS_SECRET` | gates `/api/internal/{activation-funnel,job-health}` | yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push delivery | for push |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | error + drift alerts (usage-reconcile) | recommended |
| `USAGE_RECONCILE_REPAIR` | enable idempotent counter repair (else report-only) | optional (default off) |

**Scheduled functions** (Netlify — confirm all 8 are deployed & scheduled):

`reminders` (*/5m) · `extraction-sweep` (*/10m) · `action-items-sweep` (:20 hourly) ·
`subscription-sweep` (03:30) · `suggestions-sweep` (03:00) · `trial-sweep` (03:45) ·
`purge-deleted-accounts` (04:00) · `usage-reconcile` (05:15). See
[`job-reliability-register.md`](./job-reliability-register.md).

---

## 3. Deployed smoke (NOT run here — commands for the owner)

These require the deployed host + secrets, so they are the product owner's to run.
Replace `<host>` and the secrets.

```bash
# Internal metrics — expect 200 + JSON aggregates (401 on a wrong secret, 503 if unset)
curl -s -H "Authorization: Bearer $METRICS_SECRET" \
  "https://<host>/api/internal/activation-funnel?days=30"
curl -s -H "Authorization: Bearer $METRICS_SECRET" \
  "https://<host>/api/internal/job-health"

# A cron route (should 200; 401 without the secret) — e.g. the usage reconcile sweep
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<host>/api/cron/usage-reconcile"
```

Expected: `job-health` returns `{ stuckReminders, stuckExtractions, reminderFailures24h,
automationFailures24h }`; `usage-reconcile` returns `{ ok, discrepancies, repaired,
alerts, persisted }` (report-first — `repaired: 0` unless `USAGE_RECONCILE_REPAIR`).

---

## 4. Activation gate — PENDING (product owner)

Run the controlled beta and fill
[`beta-report-TEMPLATE.md`](./beta-report-TEMPLATE.md). Four key workflows, each
measured by a domain-event milestone (from `/api/internal/activation-funnel`):

| Workflow | Milestone event | Target |
|---|---|---|
| Capture → accept an Inbox item | `planner_suggestion.accepted` | ≥ 80% processed in 24h |
| Create → complete a task | `task.completed` | — |
| Document → confirmed expense | `financial_suggestion.confirmed` | — |
| Subscription → paid cycle | `financial_obligation.paid` | — |
| First meaningful workflow in 24h | (any of the above) | ≥ 60% |

---

## 5. Launch decision — PENDING (product owner)

Record the go/no-go in a copy of
[`launch-decision-record-TEMPLATE.md`](./launch-decision-record-TEMPLATE.md):
**Launch** (safety GREEN + activation targets met) · **Limited beta extension**
(safety GREEN, activation short) · **No launch** (any safety NO).

**Owners still to name** (Phase 0): release / incident / billing-data / security.
