# Tasks standalone cutover

This runbook moves Tasks traffic without dual writes. The sequence is
`in-process` → `shadow` → `http-read` → `http`. Never skip directly to remote
writes on a new deployment.

## 1. Preconditions

- Apply migration `114_tasks_service_usage_rpc.sql`.
- Build `apps/tasks/Dockerfile` from the repository root. CI must pass both the
  standalone smoke test and container build before deployment.
- Run `npm run rehearse:tasks` against local Supabase. This is the pre-release
  gate for migration 114, live readiness, signed writes, idempotent replay and
  usage-counter compensation; it cleans its fixed disposable fixture on exit.
- Deploy `apps/tasks` with the server-only runtime variable `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` and `TASKS_SERVICE_AUTH_SECRET`.
- Configure the root app with the same secret and `TASKS_API_URL`.
- Confirm `GET <tasks>/api/health` and `GET <tasks>/api/ready` return HTTP 200.
  Readiness performs a real database query, not only an environment check.

The container listens on port `3001` by default, runs as a non-root user and
uses `/api/health` only for liveness. Configure the hosting platform's traffic
or readiness gate against `/api/ready`; a healthy process with unavailable
database access must not receive traffic.

### Publish and deploy staging

1. In GitHub Actions, manually run `Publish Tasks staging image` against the
   revision that passed CI. The workflow starts and verifies the image before
   pushing it to GHCR.
2. Copy `deploy/tasks/staging.env.example` to a host-local file outside the
   repository (recommended mode `0600`) and fill the three runtime secrets.
3. Authenticate the staging host to `ghcr.io` with a token that has only
   `read:packages` access.
4. Put the immutable `sha-<full-commit>` image from the workflow summary in
   `TASKS_IMAGE`. Do not deploy the mutable `staging` alias.
5. Validate and start the service:

   ```bash
   docker compose \
     --env-file /secure/path/tasks-staging.env \
     --file deploy/tasks/compose.staging.yml \
     config --quiet

   docker compose \
     --env-file /secure/path/tasks-staging.env \
     --file deploy/tasks/compose.staging.yml \
     pull

   docker compose \
     --env-file /secure/path/tasks-staging.env \
     --file deploy/tasks/compose.staging.yml \
     up --detach
   ```

6. Wait for `/api/ready` to return HTTP 200 before setting `TASKS_API_URL` in
   the root staging application.

Image rollback is deterministic: restore the previous immutable sha tag in the
host environment and run `docker compose up --detach` again. Application
traffic can independently return to `TASKS_TRANSPORT=in-process`.

## 2. Operator parity check

Use an active actor from a test organization/workspace. The check is read-only
and prints counts, never task content.

```bash
TASKS_API_URL=https://tasks.example.com \
TASKS_CANARY_SOURCE_URL=https://app.example.com \
TASKS_SERVICE_AUTH_SECRET=... \
TASKS_CANARY_ORGANIZATION_ID=... \
TASKS_CANARY_WORKSPACE_ID=... \
TASKS_CANARY_ACTOR_ID=... \
npm run canary:tasks
```

Required result: health, readiness, signed target RPC and source-target parity
are all `ok: true`. Health must also identify `service=tasks` and the expected
runtime stage; readiness must confirm configuration, service identity and live
database connectivity. A mismatch or non-2xx response exits non-zero.

## 3. Shadow reads

Set:

```text
TASKS_TRANSPORT=shadow
TASKS_SHADOW_READ_PERCENT=10
```

Writes and user-visible reads remain local. Ten percent of reads are repeated
against the Tasks service and compared after canonical JSON normalization.
Monitor structured event `tasks.cutover.read` for at least one normal traffic
window. Increase to `100` only when there are no persistent `mismatched` or
`shadow_failed` outcomes.

Rollback: set `TASKS_TRANSPORT=in-process`. No database rollback is needed.

## 4. Remote reads

Set `TASKS_TRANSPORT=http-read`. Reads now prefer Tasks and fall back locally on
network/service failure. Writes still execute only in root. Monitor:

- `remote_read_fallback` count and rate;
- Tasks latency and 5xx responses;
- `/api/ready` database connectivity;
- user-visible task list/detail errors.

Gate: no sustained fallback events and no parity incidents for one full traffic
window.

Rollback: use `shadow` for diagnosis or `in-process` for immediate isolation.

## 5. Remote writes

Set `TASKS_TRANSPORT=http`. Reads retain the safe local fallback. Writes execute
only in Tasks and intentionally have no automatic local retry: a timeout may
hide a committed write, so retrying in root could create a duplicate.

Monitor task creation failures, plan-limit denials, audit/domain-event writes,
and usage-counter reconciliation. Keep the root compatibility endpoint during
the observation window.

Rollback on write failure: set `TASKS_TRANSPORT=in-process`. Investigate any
timed-out write by idempotency/source key before manually retrying it.

## 6. Cleanup gate

Remove the root `/api/internal/tasks` compatibility handler only after:

- remote reads and writes have completed the agreed observation window;
- no unresolved parity, fallback or duplicate-write incident exists;
- usage reconciliation reports no Tasks drift;
- the in-process rollback path is no longer required by release policy.

Migration 114 is additive and safe to leave installed during an application
rollback.
