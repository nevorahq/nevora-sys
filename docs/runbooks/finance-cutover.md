# Finance standalone cutover

This runbook moves Finance traffic without dual writes. The sequence is
`in-process` → `shadow` → `http-read` → `http`. Never skip directly to remote
writes on a new deployment. It mirrors `docs/runbooks/tasks-cutover.md` and
`docs/runbooks/subscriptions-cutover.md` exactly, with one operation
vocabulary swapped for the other — read those runbooks' rationale sections if
something here is unclear.

## 1. Preconditions

- No database migration is required for this cutover. `createMoneyAccount`
  (the port's only mutation) is a plain insert with 23505-conflict handling —
  no new service-role RPC was added.
- No cross-product connectivity is required either, unlike Subscriptions
  (which must reach Tasks to provision payment tasks). Finance's port has no
  dependency on another product.
- Build `apps/finance/Dockerfile` from the repository root. CI must pass both
  a standalone build and a container build before deployment (Finance does
  not yet have `smoke:finance`/`rehearse:finance` scripts — see the app's
  README "Not built yet" section; verify manually until they exist).
- Deploy `apps/finance` with the server-only runtime variables
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `FINANCE_SERVICE_AUTH_SECRET`.
- Configure the root app with `FINANCE_SERVICE_AUTH_SECRET` and
  `FINANCE_API_URL`.
- Confirm `GET <finance>/api/health` and `GET <finance>/api/ready` return
  HTTP 200. Readiness performs a real database query, not only an
  environment check.

The container listens on port `3003` by default, runs as a non-root user and
uses `/api/health` only for liveness. Configure the hosting platform's traffic
or readiness gate against `/api/ready`; a healthy process with unavailable
database access must not receive traffic.

## 2. Shadow reads

Set:

```text
FINANCE_TRANSPORT=shadow
FINANCE_SHADOW_READ_PERCENT=10
```

Writes and user-visible reads remain local. Ten percent of reads are repeated
against the Finance service and compared after canonical JSON normalization.
Monitor structured event `finance.cutover.read` for at least one normal
traffic window. Increase to `100` only when there are no persistent
`mismatched` or `shadow_failed` outcomes.

Rollback: set `FINANCE_TRANSPORT=in-process`. No database rollback is needed.

## 3. Remote reads

Set `FINANCE_TRANSPORT=http-read`. Reads now prefer Finance and fall back
locally on network/service failure. Writes still execute only in root.
Monitor:

- `remote_read_fallback` count and rate;
- Finance service latency and 5xx responses;
- `/api/ready` database connectivity;
- user-visible account-list and duplicate-check errors (the latter gates
  document confirmation in `modules/review` — a stuck fallback there blocks
  expense creation, not just Finance's own UI).

Gate: no sustained fallback events and no parity incidents for one full
traffic window.

Rollback: use `shadow` for diagnosis or `in-process` for immediate isolation.

## 4. Remote writes

Set `FINANCE_TRANSPORT=http`. Reads retain the safe local fallback. Writes
execute only in Finance and intentionally have no automatic local retry: a
timeout may hide a committed account creation, so retrying in root could
create a duplicate account.

Monitor account-creation failures and the two real callers that depend on
this path staying healthy: the inline obligation-account-creation workflow
action, and `modules/review`'s duplicate-transaction check during document
confirmation. Keep the root compatibility endpoint during the observation
window.

Rollback on write failure: set `FINANCE_TRANSPORT=in-process`. `createMoneyAccount`
is idempotent by `creationRequestId` — a retry after confirming the original
request did not commit is safe.

## 5. Cleanup gate

Remove the root `/api/internal/finance` compatibility handler only after:

- remote reads and writes have completed the agreed observation window;
- no unresolved parity, fallback or duplicate-write incident exists;
- the in-process rollback path is no longer required by release policy.
