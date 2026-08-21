# ADR 001: Product module boundaries

- Status: Accepted
- Date: 2026-08-21

## Context

Nevora is currently one Next.js application backed by one Supabase project. The
Tasks, Money and Subscriptions domains are already organized as vertical
modules, but callers frequently import implementation files directly. This
makes a future extraction into independently built applications risky because
internal file layout has become an implicit public API.

## Decision

We will separate products incrementally inside the existing repository before
introducing independent deployments.

1. Supabase Auth, organizations, workspaces, RLS, billing, notifications and
   SQL migrations remain shared platform concerns.
2. Each product exposes explicit entrypoints:
   - `contracts` for types, constants, schemas and side-effect-free helpers;
   - `server` for queries and server-only services;
   - `actions` for Next.js Server Functions callable from UI code;
   - `ui` for React components.
3. Code outside a product must not import that product's implementation paths.
4. Product-to-product workflows live under `workflows/` and depend only on the
   participating products' public entrypoints. Tasks, Money and Subscriptions
   must not import one another, including type-only imports.
5. Existing routes, database tables and RLS policies do not change during the
   boundary migration.
6. Existing `index.ts` files remain temporary compatibility facades. New code
   must use the explicit entrypoints.

## Dependency direction

```text
platform <- products <- workflows <- application routes
```

Product modules must not depend on application routes. Shared platform code
must not depend on product UI or product implementation files.

## Rollout

1. Publish entrypoints and migrate deep imports.
2. Enforce the boundary in ESLint.
3. Extract shared platform services.
4. Move cross-product workflows out of product modules.
5. Add workspaces and extract Tasks as the first independently built app.

Every step must keep `typecheck`, `lint`, `test` and `build` green. No data is
copied and no dual-write path is introduced.

## Implemented workflow seam

`workflows/financial-obligations/ui.tsx` composes task/subscription obligation
panels with Money's account-creation prompt. Product panels expose a neutral
React slot and do not know which product fills it. The canonical financial-state
contract and badge live in `packages/financial-state`, because all three
products and public marketing surfaces use the same vocabulary.

The same workflow owns the three cross-product Server Actions:

- mark a one-off financial task as paid;
- mark a subscription cycle as paid;
- create a zero-balance Money account for a blocked obligation.

The product UI receives these mutations through typed callbacks. The atomic
`mark_financial_task_paid` and `mark_subscription_payment_paid` database RPCs
remain unchanged, preserving row locks and replay safety. ESLint prevents Tasks
and Subscriptions from accessing Money ledger tables directly and prevents all
three products from calling these RPCs outside the workflow.

Generated-task lifecycle operations now go through
`platform/task-lifecycle/server.ts`, backed by public Tasks server ports.
Subscriptions no longer reads or writes `todos` directly when it creates,
reschedules, skips or cancels a payment task.

Likewise, Money no longer reads `todos` or `subscription_payment_cycles` before
deleting a transaction. `platform/financial-obligations/server.ts` composes
owner-provided read ports and returns only the obligation kind. These platform
files are transport seams: when Tasks or Subscriptions becomes a separate
deployment, their in-process adapters can be replaced without changing callers.

ESLint enforces table ownership for the three products:

- Tasks cannot access Money or Subscription tables;
- Money cannot access Tasks or Subscription tables;
- Subscriptions cannot access Tasks or Money tables.

The document attachment field remains an explicit dependency through the
Documents public `ui` entrypoint. It is intentionally tracked as a later
extraction seam; no Documents implementation path is imported by Subscriptions.

## Implemented workspace seam

The repository now uses npm workspaces while keeping the production Next.js app
at the root:

- `packages/tasks-contracts` owns portable Tasks DTOs, constants, Zod schemas,
  sorting vocabulary and financial-task key helpers;
- `packages/tasks-api` defines the authenticated, framework-neutral Tasks
  read/write application port;
- `packages/tasks-runtime` owns the shared Supabase reads, mutations and
  platform-effect ports used by both deployment modes;
- `packages/financial-state` owns the canonical cross-product financial state
  contract and badge UI (moved from `platform/financial-state`);
- `apps/tasks` is an independently built Next.js runtime for the first
  extraction candidate.

The old Tasks contract and financial-state files are compatibility facades over
these packages, not duplicate implementations. External callers already use the
workspace package exports. The root Next.js app transpiles the source packages
through `transpilePackages`, and workspace-specific TypeScript checks prevent
portable extracted code from importing the root alias or Supabase.

The standalone runtime now executes the shared Supabase adapter locally. The
root compatibility paths delegate to that same package, so there remains one
business implementation and no dual-write path.

The server port is implemented by `@nevora/tasks-runtime`.
`platform/tasks/server.ts` binds root `CurrentContext` to a portable
`TasksRequestContext`; `apps/tasks` reconstructs the same context from a signed
claim plus live database state. Documents, Planner, Subscription-generated task
lifecycle operations and Money's paid-obligation guard use this port rather
than importing Tasks internals.

`markFinancialTaskPaid` is intentionally not part of the Tasks application
port: it writes the Money ledger and therefore remains owned by
`workflows/financial-obligations`. Moving it into Tasks would recreate the
cross-product coupling this ADR removes.

An authenticated HTTP adapter and `POST /api/internal/tasks` transport are now
available behind staged `TASKS_TRANSPORT` modes. `shadow` compares sampled
remote reads in the background while local execution remains authoritative;
`http-read` moves reads with local fallback while keeping writes local; `http`
moves writes without an unsafe automatic local retry. Every remote call carries an
HMAC-signed, short-lived claim bound to one operation; the standalone endpoint
verifies it and revalidates organization, workspace, active membership and the
role-derived Tasks permission against live database state. Tenant context is
never accepted from the RPC payload. `in-process` remains the rollout rollback
switch, while `TASKS_API_URL` selects the independent deployment. A read-only
operator checker validates health, database readiness, authentication and
canonical list parity before traffic advances.

Migration 114 adds two service-role-only functions for atomic `tasks.count`
reservation and compensation. They repeat active-member validation in the
database and grant no execution to browser roles.

## Rollback

Switching root `TASKS_TRANSPORT` back to `in-process` immediately restores the
in-process path over the same implementation. Migration 114 is additive and
stores no data; if the standalone runtime is abandoned, a follow-up migration
may drop its two service-only functions. Existing module facades remain until
the cutover is verified.

## Finance extraction: first slice (`packages/finance-contracts`)

Rollout step 5 continues with Money as the second product, per the plan's own
ordering (Finance before Subscriptions). `packages/finance-contracts` owns the
portable, Supabase-free DTO layer moved out of `modules/moneyflow`: account,
category, transaction and summary types (`money-types.ts`), the shared
enums/limits (`money-constants.ts`), the pure `resolveMonthRange` helper
(`month-range.ts`), and the account-creation DTOs used across the inline
account prompt and Server Action (`account-option.ts`).

`modules/moneyflow/{constants/moneyflow.constants,types/moneyflow.types,lib/month-range}.ts`
are now compatibility facades re-exporting the package by name, so every
existing internal import in `modules/moneyflow/**` keeps working unchanged —
the same technique used for `modules/tasks/constants/task.constants.ts`.
`services/money-account-service.ts` and
`actions/create-account-for-document-expense.action.ts` keep their
Supabase-backed implementations in place and re-export just the DTO types.
ESLint nudges new external code toward `@nevora/finance-contracts` instead of
`@/modules/moneyflow/contracts`, and forbids `@supabase/*` imports inside the
package like the other portable packages.

This slice does not yet include: the Zod validation schemas
(`modules/moneyflow/schemas/*`, which stay resident for now), the
`finance-api` port interface, the `finance-runtime` Supabase implementation,
or an `apps/finance` standalone deployment. Money continues to run entirely
in-process; nothing about production behavior changed.

## Subscriptions extraction: first slice (`packages/subscriptions-contracts`)

By product decision, Subscriptions extraction was picked up before Finance's
`finance-api`/`finance-runtime` layers (the rollout order otherwise follows the
plan). `packages/subscriptions-contracts` owns the full portable surface moved
out of `modules/subtracker` — a larger slice than Finance's first cut, closer
in shape to `packages/tasks-contracts`: subscription and payment-cycle
types/constants, the four payment-cycle Zod schemas (`schemas/payment-cycle.schema.ts`,
including `markSubscriptionPaymentSchema`), and three files of pure business
logic (`calculateNextPaymentDate`/`previousDay`, `createBillingPeriodKey`,
and the subscription-payment key/title builders). The schema file inlines
`z.string().uuid("Invalid ID format")` instead of importing the root app's
shared `uuidSchema` — portable packages cannot depend on the `@/` alias; this
is the same technique `packages/tasks-contracts/src/financial-task-schema.ts`
already used.

`modules/subtracker/{constants,types,schemas,services}/*.ts` are now
compatibility facades. Unlike Finance's first slice, three external
(non-`modules/subtracker`) call sites already imported
`@/modules/subtracker/contracts` directly — `modules/review/services/financial-suggestion.service.ts`
and two files under `workflows/financial-obligations/` including
`mark-subscription-payment-as-paid.ts`, the subscription mark-as-paid
workflow. Adding the ESLint nudge surfaced these as violations; all three were
migrated to import `@nevora/subscriptions-contracts` directly (same names,
same re-exported implementations — the payment workflow's behavior did not
change). Verified: `tsc --noEmit` (root + package), `eslint .`, full
`vitest run` (1922 passed, including the mark-as-paid/billing-period-key/
payment-date/payment-keys tests individually), and `npm run build` — all
green.

This slice does not yet include a `subscriptions-runtime` Supabase
implementation or an `apps/subscriptions` standalone deployment. Subscriptions
continues to run entirely in-process.

## Subscriptions extraction: the application port (`packages/subscriptions-api`)

Mirrors `packages/tasks-api`: `SubscriptionsRequestContext` (bound tenant
identity), the `SubscriptionsApplication` interface, an HTTP wire protocol
(`subscriptionsHttpRequestSchema`, a Zod discriminated union over every
operation), an `nss1.`-prefixed HMAC service-token scheme
(`sign/verifySubscriptionsServiceToken`, structurally identical to Tasks'
`nts1.` scheme, distinct token prefix so a token cannot be replayed against
the wrong product's endpoint), and `executeSubscriptionsRequest` to dispatch a
validated wire request onto a bound application.

The port's scope is deliberately narrower than the full
`modules/subtracker/server` surface — it covers exactly the operations real
cross-product callers use today, found by grepping every external importer of
`@/modules/subtracker/server`:

- `getSubscriptions`, `getPaymentCycleByTaskId`, `getPaymentCycleByTransactionId`
  — read by Money's and Tasks' own pages;
- `hasPaidSubscriptionCycleForTransaction` — read by
  `platform/financial-obligations/server.ts`, alongside the equivalent Tasks
  check;
- `createSubscriptionPaymentCycle`, `createSubscriptionPaymentTaskForCycle` —
  called by `modules/review` (document → subscription-payment detection) and
  the subscription payment workflow.

Subscriptions' own pages (`/dashboard/subscriptions/*`) and its cron sweep
(`sweepSubscriptionPaymentWorkflow`) are NOT in the port — they stay on the
in-process `/server` entrypoint directly, the same tier as Tasks' own pages
relative to `TasksApplication`. The two write operations' input types
(`CreateSubscriptionPaymentCycleInput`, `CreateSubscriptionPaymentTaskInput`)
live in `packages/subscriptions-contracts/src/server-contracts.ts`, mirroring
where Tasks put `CreateFinancialTaskCommand`.

This is the interface only — nothing implements `SubscriptionsApplication` yet
(no `subscriptions-runtime`, no `platform/subscriptions/server.ts` transport
seam), so no caller has been migrated off direct `modules/subtracker/server`
calls. Verified: `tsc --noEmit` (root + both new packages), `eslint .`, full
`vitest run` (1931 passed, including the new service-identity round-trip/
tamper/expiry tests), and `npm run build` — all green.

## Subscriptions extraction: the runtime (`packages/subscriptions-runtime`)

Implements `SubscriptionsApplication` against Supabase, mirroring
`packages/tasks-runtime`'s `queries.ts` / `mutations.ts` / `effects.ts` /
`context.ts` / `application.ts` split. `resolveSubscriptionsRuntimeContext`
revalidates a signed service claim against live organization/workspace/
membership state before trusting it, byte-for-byte the same shape as
`resolveTasksRuntimeContext`.

One asymmetry from Tasks drove the design: `createSubscriptionPaymentTaskForCycle`
provisions the next period's payment task, and `todos` is Tasks-owned — ESLint
already forbids `modules/subtracker/**` from writing it directly, and that
ownership boundary has to hold for this package too. Unlike
`TasksRuntimeEffects` (whose effects — usage RPCs, `entity_links`,
`domain_events`, `audit_logs` — are all self-contained Supabase calls with no
other product involved), `SubscriptionsRuntimeEffects.createGeneratedTask` is
architecturally *forced* to be an injected effect: `packages/**` cannot import
`@/platform/task-lifecycle/server`, and hard-wiring a call to
`@nevora/tasks-api` would defeat the point (this package would then need to
know whether Tasks is in-process or remote). So `subscriptions-runtime` ships
no concrete effects factory — whoever builds
`SubscriptionsRuntimeDependencies` supplies one. That wiring is the next
step's job (the `platform/subscriptions/server.ts` transport seam), not this
package's.

The two mutations preserve the exact idempotency/concurrency guarantees of
their `modules/subtracker/services/*` originals: `createSubscriptionPaymentCycle`
resolves a `23505` conflict to the existing cycle (by billing-period-key, then
by open status) instead of erroring; `createSubscriptionPaymentTaskForCycle`
short-circuits on `auto_task_enabled=false` / an already-attached `task_id` /
a non-`planned` cycle, and promotes the cycle with an `.is("task_id", null)`
guard so a concurrent caller cannot double-attach — a lost race reports
failure even though the task effect already ran, rather than claiming the
cycle was promoted. `runtime.test.ts` asserts all of this directly, including
the lost-race case, which is the one path a pure code read is most likely to
get wrong. Verified: `tsc -p packages/subscriptions-runtime` (and the whole
`typecheck:packages` chain, including `apps/tasks`), `eslint .`, full
`vitest run` (1954 passed — 10 new, all in `runtime.test.ts`), and
`npm run build`.

Still nothing calls this package from the root app — that migration
(`platform/subscriptions/server.ts` plus the ~6 real cross-product call
sites) is the next increment.

## Subscriptions extraction: the transport seam and caller migration

`platform/subscriptions/server.ts` mirrors `platform/tasks/server.ts`'s shape
(`toSubscriptionsRequestContext`, `createInProcessSubscriptionsApplication`,
`getSubscriptionsApplication`) but is deliberately narrower: there is no
`SUBSCRIPTIONS_TRANSPORT` branching and no `http.ts`/`cutover.ts`, because
there is no `apps/subscriptions` deployment yet to shadow reads against or
cut traffic over to. That machinery would be unverifiable today; add it the
same way Tasks did, once the standalone app exists.

The more consequential discovery: `platform/tasks/server.ts`'s in-process
adapter does not call `@nevora/tasks-runtime` at all — it wires the
**original** `@/modules/tasks/server` functions directly, and
`@nevora/tasks-runtime` exists solely for `apps/tasks` to consume. Subscriptions
follows the identical shape: `createInProcessSubscriptionsApplication` calls
the original, unchanged `@/modules/subtracker/server` functions (already
battle-tested; `create-subscription-payment-cycle.ts` and
`create-subscription-payment-task.ts` were not touched), not
`@nevora/subscriptions-runtime`. That package remains reserved for a future
`apps/subscriptions`. Keeping two live copies of the same mutation logic
in-process would be exactly the dual-write the ADR forbids — there is one
implementation at a time, selected by deployment, never both.

All 6 real cross-product callers found earlier were migrated onto
`getSubscriptionsApplication`: Tasks' task detail page
(`getPaymentCycleByTaskId`), Money's two pages
(`getSubscriptions`, `getPaymentCycleByTransactionId`),
`platform/financial-obligations/server.ts`
(`hasPaidSubscriptionCycleForTransaction`, now symmetric with its existing
`getTasksApplication()` call), `modules/review`'s document→subscription-payment
flow, and the subscription mark-as-paid workflow (both call
`createSubscriptionPaymentCycle`/`createSubscriptionPaymentTaskForCycle`).
Subscriptions' own pages, its cron sweep, and the pure `createBillingPeriodKey`
helper (no side effects, doesn't need a port) deliberately still call
`@/modules/subtracker/server` directly — same tier as Tasks' own pages.

Two pre-existing unit tests broke during this migration —
`platform/financial-obligations/server.test.ts` and
`workflows/financial-obligations/services/mark-subscription-payment-as-paid.test.ts` —
because their mock `CurrentContext` fixtures omitted `permissions`, which
`toSubscriptionsRequestContext` now reads (mirroring
`toTasksRequestContext`). Both were fixed by mocking `@/platform/subscriptions/server`'s
`getSubscriptionsApplication` directly, the same level `getTasksApplication`
was already mocked at in the first file — a narrower, more correct unit
boundary than reaching two layers deeper, and one that doesn't depend on the
seam's own context-mapping (separately covered by
`platform/subscriptions/server.test.ts`).

Verified: `tsc --noEmit`, `eslint .`, full `vitest run` (1959 passed, 0
failed), and `npm run build`. Production behavior for Money, Tasks and the
payment workflow is unchanged — same functions, same table access, same RPCs;
only the import path changed.

## Finance extraction: api, runtime, transport seam and caller migration

Money's cross-product surface is real but narrower than its full internal
`modules/moneyflow/server` surface, found the same way as Subscriptions — by
grepping every external importer. `FinanceApplication`
(`packages/finance-api`) covers exactly four operations: `getAccounts`,
`findActiveMoneyAccountsByCurrency`, `createMoneyAccount`,
`findDuplicateTransaction`. Deliberately excluded, each for a distinct
reason:

- Money's own pages/rules page and its `suggestions-sweep` cron — same tier
  as Tasks' and Subscriptions' own pages relative to their ports.
- `seedDefaultMoneyAccount` (onboarding) — called with explicit
  `organizationId`/`userId` before a workspace or permission set exists;
  onboarding is bootstrapping a tenant, not one already-authenticated product
  calling another. It does not fit a bound `FinanceRequestContext` at all, so
  it stays a direct call, not merely an excluded-for-now one.
- `classifyExpense` / `upsertPrivateMerchantRule` / `getExpenseContexts` (the
  expense-classification subsystem, used by `modules/review`) — a
  meaningfully larger, distinct sub-domain (its own vocabulary:
  `ExpenseClassification`, `ClassificationMethod`, `ExpenseContextOption`).
  Deliberately deferred to a later increment rather than rushed under an
  already-large session; `modules/review` keeps calling it directly.
  `normalizeMerchantName` is pure and stayed a direct import for the same
  reason `createBillingPeriodKey` did for Subscriptions.

`packages/finance-runtime` needed no effects abstraction (unlike
`subscriptions-runtime`): none of the four ported operations emit domain
events or audit logs in their original implementation — verified by reading
`money-account-service.ts` before porting, not assumed. `findActiveMoneyAccountsByCurrency`
returns a raw Postgrest `{data, error}` shape in the original; the runtime
package's version returns a proper `{ok:true, accounts} | {ok:false, error}`
result instead, because collapsing a genuine lookup failure into "zero
accounts" — the callers use this as an existence check before creating an
account — could create a redundant account for a real duplicate the query
never got to see. The reshaping happens once, in the runtime package's own
query function, not sprinkled at each call site.

`platform/finance/server.ts` follows the now-established shape exactly:
`toFinanceRequestContext`, `createInProcessFinanceApplication` (wires the
original, unchanged `@/modules/moneyflow/server` functions — not
`@nevora/finance-runtime`, reserved for a future `apps/finance`), and
`getFinanceApplication` with no transport-mode branching yet. All four real
callers were migrated: Tasks' and Subscriptions' detail pages
(`getAccounts`), the inline obligation-account-creation workflow action
(`findActiveMoneyAccountsByCurrency` + `createMoneyAccount`, preserving its
existing error-vs-empty distinction end to end), and `modules/review`'s
duplicate-transaction check.

Verified: `tsc --noEmit` (root + both new packages via the full
`typecheck:packages` chain, including `apps/tasks`), `eslint .`, full
`vitest run` (1988 passed, 0 failed — no pre-existing test fixtures needed
fixing this time), and `npm run build`.

## Current state of all three products (as of this round of work)

| | contracts | api (port) | runtime | platform seam | callers migrated | standalone app |
|---|---|---|---|---|---|---|
| Tasks | done | done | done | done | done | `apps/tasks` exists, staged, `in-process` live |
| Subscriptions | done | done | done | done | done | not started |
| Finance | done | done | done | done | done | not started |

Finance and Subscriptions are now at the same in-process maturity as Tasks
was before its pilot extraction. What remains for either to reach Tasks'
current point is exclusively the standalone-deployment work: an `apps/*`
package mirroring `apps/tasks` (Dockerfile, health/ready routes, Netlify
staging, GH Actions image publish), `platform/*/http.ts` and `cutover.ts`,
and the `*_TRANSPORT` staged rollout — none of which is buildable-and-
verifiable before a decision to actually stand up that deployment.

## Subscriptions extraction: `apps/subscriptions`

Mirrors `apps/tasks` layer for layer: `src/{environment,supabase,boundary,
request-handler}.ts`, `app/{layout,page}.tsx`, `app/api/{health,ready}/route.ts`,
`app/api/internal/subscriptions/route.ts`, `Dockerfile`, `netlify.toml`,
`.env.example`, `README.md`. `platform/subscriptions/{http,cutover,
service-context}.ts` were added to match `platform/tasks/*`, and
`getSubscriptionsApplication()` now does the same `SUBSCRIPTIONS_TRANSPORT`
staged branching (`in-process → shadow → http-read → http`) `getTasksApplication()`
does — the earlier "narrower, no transport branching" state was explicitly
temporary, gated on this app existing. The root app gained
`app/api/internal/subscriptions/route.ts` (the compatibility/canary endpoint,
mirroring `app/api/internal/tasks/route.ts`) and a proxy bypass
(`isSubscriptionsServiceTransportRequest`, exact-path + `nss1.`-prefix, added
to `proxy.ts` alongside the existing Tasks one) — without it, a
session-less service-token request to `/api/internal/subscriptions` would
have been redirected to `/login` before reaching the handler.

**The one real design gap this surfaced**: `SubscriptionsRuntimeEffects.createGeneratedTask`
needs to reach Tasks, and `apps/subscriptions` is a genuinely separate
deployment with no in-process path to `platform/task-lifecycle/server.ts`.
The natural-looking fix — call `@nevora/tasks-api`'s HTTP application factory
— doesn't exist: `createHttpTasksApplication` lives in the root app's
`platform/tasks/http.ts`, not in the `tasks-api` package, because it's
root-app composition code, not a portable export. Building a full generic
`TasksApplication` HTTP adapter inside `apps/subscriptions` would also have
been wrong scope — Subscriptions only ever calls one Tasks operation.
`apps/subscriptions/src/tasks-client.ts` is a minimal, single-operation
client instead: it uses only the wire-protocol pieces `@nevora/tasks-api`
does export (`TASKS_HTTP_ENDPOINT`, the transport header/version constants,
`signTasksServiceToken`) to call `createGeneratedTask` directly. This also
settled where the concrete effects factory belongs: NOT in
`@nevora/subscriptions-runtime` (a portable package depending on another
product's package would recreate the coupling this ADR removes one layer up)
but in `apps/subscriptions/src/effects.ts` — a deployment's own composition
root, playing the same role `platform/*` plays for the root app. `apps/subscriptions`
therefore needs `TASKS_API_URL`/`TASKS_SERVICE_AUTH_SECRET` as required
runtime config, not optional — without them, payment-task provisioning has
no path at all.

`emitDomainEvent`, `emitAuditLog` and `linkSubscriptionToTask` stay
self-contained raw Supabase inserts against shared, unowned tables
(`domain_events`, `audit_logs`, `entity_links`), the same reasoning
`@nevora/tasks-runtime`'s effects already used.

**Deliberately not built** (flagged in `apps/subscriptions/README.md`'s "Not
built yet" section, not silently skipped): the GitHub Actions image-publish
workflow, a `deploy/subscriptions/` staging compose definition, and
`canary:subscriptions`/`rehearse:subscriptions`/`smoke:subscriptions`
operator scripts. Tasks has all of these; Subscriptions doesn't yet, because
building them requires real infrastructure decisions (registry naming,
staging host, secrets) that belong to whoever actually stands this
deployment up. `docs/runbooks/subscriptions-cutover.md` mirrors
`docs/runbooks/tasks-cutover.md`'s procedure and flags this gap at
precondition #2 rather than assuming the tooling exists.

Verified: `tsc --noEmit` for the root app, every package (via the full
`typecheck:packages` chain), and `apps/subscriptions` itself; `eslint .`;
full `vitest run` (2018 passed, 0 failed); `npm run build` (root app); and
**`npm run build:subscriptions`** — a real standalone Next.js production
build of `apps/subscriptions`, not just a typecheck, producing the same
`.next/standalone` output shape `apps/tasks` does. Docker/Netlify/GitHub
Actions execution itself was not attempted — those require infrastructure
this environment doesn't have (a Docker daemon, Netlify credentials, a live
Actions run) — the Dockerfile and `netlify.toml` are structural mirrors of
`apps/tasks`'s proven versions, not independently verified.

## Finance extraction: `apps/finance`, and the full three-product picture

Completes Finance to the same point Subscriptions reached: `platform/finance/{http,cutover,service-context}.ts`
were added (mirroring the Subscriptions versions exactly, `nfs1.`-prefixed
tokens), `getFinanceApplication()` gained real `FINANCE_TRANSPORT` staged
branching, the root app gained `app/api/internal/finance/route.ts` and an
`isFinanceServiceTransportRequest` proxy bypass, and `apps/finance` was built
as a standalone Next.js app mirroring `apps/tasks`/`apps/subscriptions`.

**The one thing that made this build meaningfully simpler than Subscriptions**:
`apps/finance/src/request-handler.ts` needs no `effects.ts` and no
cross-service client. `createMoneyAccount` — the Finance port's only
mutation — emits no domain events, no audit logs, and calls no other
product; this was confirmed by reading `money-account-service.ts` before
ever porting it (see the Finance runtime section above), not assumed when
convenient here. `createFinanceRuntimeApplication` from
`@nevora/finance-runtime` is wired directly into the request handler with no
composition layer in between — there was nothing for one to do.

Verified exactly like Subscriptions: `tsc --noEmit` for the root app, every
package and all three apps (via the full `typecheck:packages` chain);
`eslint .`; full `vitest run` (2041 passed, 0 failed); `npm run build` (root
app); and **`npm run build:finance`** — a real standalone Next.js production
build, producing the same `.next/standalone` shape as `apps/tasks` and
`apps/subscriptions`. `npm run build:subscriptions` was re-run at the end of
this pass too, to confirm the shared `proxy.ts`/`routes.ts` changes didn't
regress it — still green. Docker/Netlify/GitHub Actions execution was not
attempted, same caveat as Subscriptions.

**All three products now have a real, building standalone `apps/*`.** Tasks
is the only one with the staged-rollout automation (GHCR publish workflow,
staging compose, canary/rehearse/smoke scripts) and the only one actually
serving any traffic outside `in-process`. Subscriptions and Finance are
built, tested, and structurally deployable, but neither has taken a single
real request yet — every `*_TRANSPORT` defaults to `in-process` everywhere,
and turning that dial is a decision for whoever runs the actual rollout
in `docs/runbooks/{tasks,subscriptions,finance}-cutover.md`, not something
implied by the code existing.

## Product independence: removing the Money obligation bridge (2026-08-22)

Product decision, deeper than deployment independence: Tasks, Money and
Subscriptions must not *functionally* depend on each other either, not just
avoid importing each other's implementation files. `workflows/financial-
obligations` (the one sanctioned cross-product integration this ADR
originally carved out — mark a financial task or subscription cycle paid,
create a Money account for a blocked obligation) is deleted, along with
`platform/financial-obligations/server.ts` (the paid-obligation-for-
transaction resolver Money's delete-transaction guard used).

**Financial Context Tasks (migration 079) are removed entirely** — Tasks
reverts to a plain to-do list. `task_context_type`, `financial_status` and
the rest of the financial-context columns are dropped from `todos` (migration
115), along with `mark_financial_task_paid()`. The document → detect-a-
financial-obligation → auto-create-a-task pipeline
(`modules/documents/services/{detect-financial-obligation,classify-financial-
document}.ts`) is deleted with it, since its only output no longer exists.
Planner/Inbox can still generate `create_financial_task` /
`create_money_reminder` / `create_subscription_reminder` suggestions (the AI
prompt in `detect-planner-intent.ts` was not touched); accepting one now
refuses safely, the same way `create_document` / `assign_project` /
`create_project` already did — a known, deliberate gap, not an oversight.

**Subscriptions keeps its own "mark as paid"**, it just stopped telling Money
about it. `modules/subtracker/services/mark-subscription-payment-as-paid.ts`
replaces the RPC-backed `mark_subscription_payment_paid()` (078, dropped in
115) with a plain guarded `UPDATE ... WHERE status IN ('planned',
'task_open')` — idempotent the same way, just local. It no longer asks the
user to pick a Money account; `SubscriptionPaymentTaskPanel` /
`SubscriptionPaymentWorkflowPanel` dropped that step. Recurring-cycle
scheduling (`subscription_payment_cycles`, due dates, `calculateNextPaymentDate`)
is unchanged — that was always Subscriptions-native, not part of the bridge.

**One read link deliberately survives**: Money's transaction detail pages
still call `getSubscriptionsApplication().getPaymentCycleByTransactionId()`
to show which subscription a *historical* transaction settled
(`subscription_payment_cycles.transaction_id`, populated only by the now-
removed RPC, so only pre-existing rows carry it). This is informational
display, not a money-posting mechanism, and was out of scope for this pass —
flagged here rather than cut silently.
