# Job reliability register (Sprint 5 — S5.3)

**Status:** Canonical inventory of every scheduled background job — its trigger,
auth, idempotency, retry/terminal behaviour, stuck-job recovery, SLO and owner.
Kept honest by `test/job-reliability-register.test.ts` (every `/api/cron/*` route
must appear here).

Host is **Netlify**: `vercel.json` crons do not fire; each job is a Netlify
scheduled function that calls its `CRON_SECRET`-gated route (see
[`netlify/lib/trigger-cron.ts`](../../netlify/lib/trigger-cron.ts)). All routes
are in `MACHINE_ROUTES` (proxy bypass) and fail closed: `503` if `CRON_SECRET` is
unset, `401` on a wrong secret.

---

## 1. Register

| Job (`/api/cron/…`) | Schedule (UTC) | Auth | Idempotency | Retry / terminal state | Stuck-job recovery |
|---|---|---|---|---|---|
| `reminders` | `*/5 * * * *` | CRON_SECRET | `reminder_schedules.idempotency_key` (source+recipient+milestone+date) | `attempt_count`; **terminal `failed` at `attempt_count ≥ 5`** (migration 075) | reclaims `processing` older than 15 min |
| `extraction-sweep` | `*/10 * * * *` | CRON_SECRET | in-flight lock (migration 051) | crashed job forced to **terminal `failed`** + lock released → user can retry | reaps `processing` older than 10 min (`extraction-worker`) |
| `action-items-sweep` | `20 * * * *` | CRON_SECRET | `action_items_dedupe_idx` (one item per org+type+source) | idempotent regeneration; no retry state needed | `reconcileStaleActionItems` closes items whose source is terminal |
| `subscription-sweep` | `30 3 * * *` | CRON_SECRET | `unique(org, subscription, billing_period_key)` + single-open partial index | idempotent repair; money-free | n/a (repair sweep) |
| `suggestions-sweep` | `0 3 * * *` | CRON_SECRET | TTL flip to `expired` (re-running is a no-op) | idempotent expiry; no retry state | n/a |
| `trial-sweep` | `45 3 * * *` | CRON_SECRET | trial-lifecycle transitions are idempotent | idempotent; no retry state | n/a |
| `purge-deleted-accounts` | `0 4 * * *` | CRON_SECRET | only purges rows past the 30-day grace; re-running is a no-op | idempotent hard-purge | n/a |
| `usage-reconcile` | `15 5 * * *` | CRON_SECRET | report-first; repair only when `USAGE_RECONCILE_REPAIR` set; setting a counter to its authoritative value is idempotent | logs every discrepancy, alerts above threshold; repair is gated | detects + repairs counter drift itself |

## 2. SLO (proposed — to be ratified by the ops owner)

Aligned with the roadmap guardrail (protected cron success ≥ 99.5%):

- **Delivery/attention jobs** (`reminders`, `extraction-sweep`,
  `action-items-sweep`): success ≥ 99.5% per rolling 7 days; no job stuck in a
  non-terminal state older than its recovery window (15 / 10 / — min).
- **Daily maintenance** (`subscription-sweep`, `suggestions-sweep`,
  `trial-sweep`, `purge-deleted-accounts`): at least one successful run per day;
  a missed day is a P2 alert.
- **Hard invariant:** zero duplicate posted transactions and zero blocked real
  payments from any job (payments are usage-exempt — see
  [`../runbooks/usage-counter-drift.md`](../runbooks/usage-counter-drift.md)).

## 3. Owners

Ownership assignment is a **product/ops-owner task** (Phase 0 deliverable), not a
code change. Until named, escalation follows
[`../runbooks/cron-failure.md`](../runbooks/cron-failure.md).

| Job | Owner |
|---|---|
| all scheduled jobs | **TBD — release/ops owner** |

## 4. Durable-queue / DLQ decision (P3)

**Decision (Sprint 5): stay on cron + idempotent DB sweeps. Do NOT adopt a durable
queue or a dead-letter platform now.**

Rationale: every job is idempotent and re-runnable; the two jobs that can get
stuck (`reminders`, `extraction-sweep`) already have a terminal-failure state and
a stale-reclaim reaper, which is the DLQ-equivalent — a crashed unit lands in a
visible `failed` state a human/user can retry, not a silent black hole.

**Revisit when any of these holds** (matches roadmap §8 "durable queue" gate):

- a job needs sub-minute latency that a 5-minute cron cannot meet;
- sustained volume makes a single bounded sweep batch insufficient (a sweep
  regularly hits its `LIMIT` and leaves a backlog);
- a job acquires a non-idempotent side effect that a retry could duplicate;
- terminal-`failed` volume exceeds a set threshold for two consecutive weeks.

**Revisit date:** at the Sprint 6 launch gate, or earlier if a threshold above is
crossed. Recorded here so the decision is explicit, not implicit.
