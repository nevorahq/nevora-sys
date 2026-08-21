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
