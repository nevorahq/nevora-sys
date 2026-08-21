# Tasks server API contract

## Purpose

`@nevora/tasks-api` is the deployment-neutral server boundary for Tasks. It lets
the current root application call Tasks in-process today and switch to an
authenticated HTTP or queue adapter later without changing business callers.

## Trusted context

Every application instance is bound to `TasksRequestContext`:

- `organizationId` — tenant scope;
- `workspaceId` — active workspace scope;
- `actorId` — authenticated user or service actor;
- `permissions` — permission snapshot resolved by the host platform.

The root adapter derives these values from `CurrentContext`. Organization and
workspace identifiers are not accepted by read/write method payloads. List
queries are pinned to the bound workspace by the adapter.

## Port surface

The application exposes:

- task detail and list reads;
- standard and financial-obligation task creation;
- generated-task create, due-date update and retirement operations;
- a read-only check for whether a paid task owns a Money transaction.

Portable inputs and results live in `@nevora/tasks-contracts`. The API package
contains no Next.js, Supabase or root-application imports.

## Current adapter

`@nevora/tasks-runtime` implements `TasksApplication` with shared Supabase
queries and mutations. `platform/tasks/server.ts` exposes the root in-process
compatibility adapter, while `apps/tasks` creates the same runtime behind its
independent Route Handler.

Product-internal pages and legacy `features/todos` code can remain on the public
Tasks server entrypoint during UI extraction. Cross-product and cross-module
orchestration must use the platform adapter.

`getTasksApplication()` selects the transport:

- unset or `TASKS_TRANSPORT=in-process` uses the direct adapter;
- `TASKS_TRANSPORT=shadow` keeps local reads and writes authoritative while a
  configurable sample of remote reads is compared after the response;
- `TASKS_TRANSPORT=http-read` uses remote reads with local fallback and keeps
  writes local;
- `TASKS_TRANSPORT=http` uses remote reads with local fallback and sends writes
  only to the independent runtime;
- any other value fails closed.

Remote writes are never retried locally: a timeout can occur after the remote
commit, so an automatic retry could duplicate a task. Shadow sampling is set by
`TASKS_SHADOW_READ_PERCENT` and does not add latency to the authoritative
response because Next.js `after()` schedules the parity check after delivery.

The HTTP adapter calls `POST /api/internal/tasks` with a strict operation
envelope and never serializes `TasksRequestContext` in the RPC payload. The root
adapter signs every remote request with `TASKS_SERVICE_AUTH_SECRET`; browser
cookies do not cross the service boundary. The standalone handler applies
`data.write` to mutations, validates payloads with the `@nevora/tasks-api`
schemas and disables response caching. The root handler retains session support
only as a compatibility/rollback endpoint.

Service claims use HMAC-SHA256, live for 60 seconds by default (120 seconds
maximum), identify actor/organization/workspace, carry only the bounded
`org.read` and `data.write` permissions, and are bound to exactly one RPC
operation. The handler verifies them in constant time and then reloads the
organization, workspace, active membership and current role-derived Tasks
permissions through the service-role client. A signed claim therefore cannot
preserve access after membership/role revocation or be replayed for another
operation.

The endpoint also requires the non-simple `x-nevora-tasks-transport: tasks-v1`
header. This hides it from ordinary navigation/form posts and forces a browser
cross-origin caller through CORS preflight; session authorization and RLS remain
the authoritative security boundaries. The root proxy bypasses session routing
only for the exact internal Tasks path with the service-token prefix; the Route
Handler still performs full cryptographic and live-state verification.

## Explicit exclusion

Marking a financial task paid is not a Tasks mutation: it atomically creates a
Money transaction and settles the task. That operation stays in
`workflows/financial-obligations`, preserving ledger ownership and idempotency.

## Standalone runtime and remaining step

`apps/tasks` is a separately buildable Next.js standalone runtime with health,
readiness and internal Tasks routes. It verifies service claims and executes
the shared `@nevora/tasks-runtime` queries and mutations directly against
Supabase; there is no reverse proxy to the root application and no dual write.

Migration 114 adds service-role-only atomic reservation/compensation RPCs for
`tasks.count`. Both functions repeat active-membership validation and expose no
grant to browser roles. Events, audit records and document-task links are
written by the runtime with actor and tenant attribution from the verified
context.

The remaining operational step is production cutover: deploy `apps/tasks`,
apply migration 114, configure its three secrets, run the read-only parity
checker, then advance root through `shadow`, `http-read` and `http` according to
the Tasks cutover runbook. `in-process` remains the rollback switch until live
monitoring confirms parity; the root compatibility handler can be removed only
afterward.
