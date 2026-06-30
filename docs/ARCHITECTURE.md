# Architecture — Nevora Business OS

> Source of truth for the target architecture. Reflects the **actual repository**
> (Server Actions, RLS policies, numbered SQL migrations), not generic best
> practices. For the full architect system prompt see
> [`nevora-architect-prompt.md`](./nevora-architect-prompt.md).

Nevora Business OS is a **multi-tenant SaaS platform** for small and medium
business, built as a **Modular Monolith** on Next.js 16 (App Router) + Supabase
(PostgreSQL + Auth + RLS). One deployable application, many domain modules, with
tenant isolation enforced in the database — not only in code.

## Architecture principles

- **Modular Monolith** — one app, vertical domain modules under `modules/`.
- **Multi-Tenant SaaS** — every business row is scoped by `organization_id`
  (and `workspace_id` where workspace-scoped). Isolation is enforced by RLS.
- **Security First** — RLS is the primary tenant boundary; `.eq()` in app code
  is defense-in-depth, never the boundary.
- **Domain Events** — meaningful mutations emit a `domain_events` record via
  `emitDomainEvent(...)`. One mechanism per table (service emit *or* DB trigger,
  not both).
- **Feature-Based Modules** — each module ships its own actions, queries,
  services, schemas, components and types behind a public `index.ts`.
- **AI-ready data model** — structured events + entity links give AI features
  a stable substrate. AI assistance is real but scoped (see MODULE_STATUS).

## Hard rules

- **No business logic in `app/page.tsx`.** Pages are a routing/composition layer
  only — they read in Server Components and delegate to module code.
- **No module-specific logic in `shared/`.** `shared/` is reusable
  infrastructure and UI only.
- **No service role in application logic.** `SUPABASE_SERVICE_ROLE_KEY` is used
  only by the server-side rate limiter and the cron extraction-sweep worker,
  never in request-path business code.
- **No client-trusted `organization_id` / `workspace_id`.** They come from the
  session via `requireOrg()` — never from `formData` or query params.
- **Mutations are Server Actions** (`"use server"`), not `app/api/` route
  handlers. Route handlers exist only for public/internal/webhook/cron surfaces.
- **No raw SQL string interpolation.** Use the Supabase client / RPC with
  parameters.
- **No `any` in TypeScript.** Describe interfaces/types.

## Target architecture

```
Business OS
├── Core          — auth, organizations, workspaces, context, permissions
├── Modules       — vertical business domains (tasks, money, documents, …)
├── Event Layer   — domain_events + automation dispatch (engine/handlers)
├── Security Layer — RLS policies, SECURITY DEFINER RPC, grants, rate limiting
├── SaaS Layer    — billing, trials, plan limits, members/invites
└── AI Layer      — insights, recommendations, document extraction (Anthropic)
```

## Application-layer rules

```
app/      = routing and composition layer (pages, layouts, route handlers)
modules/  = business / domain layer (vertical feature modules)
features/ = UI feature compositions that wire module data into screens
shared/   = reusable infrastructure and UI (routes, i18n, ui kit, utils)
lib/      = cross-cutting infra: supabase clients, auth, env, events,
            rate-limit, billing, entity-links, http helpers
entities/ = low-level domain models
store/    = Redux store + provider (client UI state only)
db        = supabase/migrations/ — schema, RLS, RPC, indexes, grants
```

`proxy.ts` is the Next.js 16 proxy (the former `middleware`): it handles auth
gating and redirects. See `AGENTS.md` — read `node_modules/next/dist/docs/`
before touching Next internals, this is not the Next.js in your training data.

## Cross-module relations

Modules are linked through the **`entity_links`** table
(`source_type/source_id → target_type/target_id`), not direct foreign keys
between business tables. Example: a subscription attaches to a money transaction
through a `paid_by` link, not a `subscription_id` column. The `relations` module
and Action Center build on top of `entity_links`.

## Multi-currency

`money_transactions` / `subscriptions` store the amount in the transaction's own
`currency`. Reporting fixes the **historical exchange rate on the transaction
date** (`exchange_rates` + `fn_get_exchange_rate`, migrations `049`/`050`) — past
amounts are never re-priced at today's rate. Never sum different currencies into
one number without going through the FX layer; otherwise show a per-currency
breakdown.

## Security rules (mandatory)

- RLS enabled on every business table.
- `SELECT` policy present; `INSERT`/`UPDATE` policies carry `WITH CHECK`.
- Mutations enforce a permission check (owner/admin/member) before writing.
- Server Actions and API routes validate input with **Zod**.
- No raw SQL interpolation; no service role in application logic.
- No cross-tenant data access — `organization_id`/`workspace_id` from session.
- `SECURITY DEFINER` functions pin `search_path` and have an explicit
  `GRANT EXECUTE` model (`035_*`, `037_*`).

See [`SECURITY.md`](./SECURITY.md) for the per-change checklist.
