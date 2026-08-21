# Subscriptions standalone cutover

This runbook moves Subscriptions traffic without dual writes. The sequence is
`in-process` → `shadow` → `http-read` → `http`. Never skip directly to remote
writes on a new deployment. It mirrors `docs/runbooks/tasks-cutover.md`
exactly, with one operation vocabulary swapped for the other — read that
runbook's rationale sections if something here is unclear.

## 1. Preconditions

- No database migration is required for this cutover — unlike Tasks (which
  needed migration 114 for its service-only usage-reservation RPCs),
  Subscriptions' standalone effects (`emitDomainEvent`, `emitAuditLog`,
  `linkSubscriptionToTask`) are plain inserts into shared, already-existing
  tables (`domain_events`, `audit_logs`, `entity_links`).
- Build `apps/subscriptions/Dockerfile` from the repository root. CI must pass
  both a standalone build and a container build before deployment (Subscriptions
  does not yet have `smoke:subscriptions`/`rehearse:subscriptions` scripts —
  see the app's README "Not built yet" section; verify manually until they exist).
- Deploy `apps/subscriptions` with the server-only runtime variables
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUBSCRIPTIONS_SERVICE_AUTH_SECRET`, `TASKS_API_URL` and
  `TASKS_SERVICE_AUTH_SECRET`. The last two are required: this deployment
  calls the Tasks service to provision payment tasks and has no in-process
  fallback.
- Configure the root app with `SUBSCRIPTIONS_SERVICE_AUTH_SECRET` and
  `SUBSCRIPTIONS_API_URL`.
- Confirm `GET <subscriptions>/api/health` and `GET <subscriptions>/api/ready`
  return HTTP 200. Readiness performs a real database query, not only an
  environment check.
- Confirm the Subscriptions deployment can actually reach the Tasks
  deployment: call `createSubscriptionPaymentCycle` then
  `createSubscriptionPaymentTaskForCycle` against a disposable test
  subscription and verify a real task is created in Tasks. This cross-service
  path has no equivalent in the Tasks cutover and is the one failure mode
  unique to Subscriptions.

The container listens on port `3002` by default, runs as a non-root user and
uses `/api/health` only for liveness. Configure the hosting platform's traffic
or readiness gate against `/api/ready`; a healthy process with unavailable
database access must not receive traffic.

## 2. Shadow reads

Set:

```text
SUBSCRIPTIONS_TRANSPORT=shadow
SUBSCRIPTIONS_SHADOW_READ_PERCENT=10
```

Writes and user-visible reads remain local. Ten percent of reads are repeated
against the Subscriptions service and compared after canonical JSON
normalization. Monitor structured event `subscriptions.cutover.read` for at
least one normal traffic window. Increase to `100` only when there are no
persistent `mismatched` or `shadow_failed` outcomes.

Rollback: set `SUBSCRIPTIONS_TRANSPORT=in-process`. No database rollback is needed.

## 3. Remote reads

Set `SUBSCRIPTIONS_TRANSPORT=http-read`. Reads now prefer Subscriptions and
fall back locally on network/service failure. Writes still execute only in
root. Monitor:

- `remote_read_fallback` count and rate;
- Subscriptions service latency and 5xx responses;
- `/api/ready` database connectivity;
- user-visible subscription list/detail errors.

Gate: no sustained fallback events and no parity incidents for one full
traffic window.

Rollback: use `shadow` for diagnosis or `in-process` for immediate isolation.

## 4. Remote writes

Set `SUBSCRIPTIONS_TRANSPORT=http`. Reads retain the safe local fallback.
Writes execute only in Subscriptions and intentionally have no automatic
local retry: a timeout may hide a committed payment-cycle or payment-task
creation, so retrying in root could create a duplicate.

Monitor payment-cycle and payment-task creation failures, the Subscriptions →
Tasks cross-service call specifically (a Tasks outage now fails Subscriptions
writes too), audit/domain-event writes, and the payment workflow end to end.
Keep the root compatibility endpoint during the observation window.

Rollback on write failure: set `SUBSCRIPTIONS_TRANSPORT=in-process`.
Investigate any timed-out write by idempotency key
(`buildCycleIdempotencyKey`) before manually retrying it — both mutations are
idempotent by design (see `docs/adr/001-product-module-boundaries.md`), so a
retry after confirming the original did not commit is safe.

## 5. Cleanup gate

Remove the root `/api/internal/subscriptions` compatibility handler only after:

- remote reads and writes have completed the agreed observation window;
- no unresolved parity, fallback or duplicate-write incident exists;
- the in-process rollback path is no longer required by release policy.
