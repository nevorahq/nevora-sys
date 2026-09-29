# Architecture — Nevora Business OS

> Source of truth for the target architecture. Reflects the **actual repository**
> (Server Actions, RLS policies, numbered SQL migrations), not generic best
> practices. For the full architect system prompt see
> [`nevora-architect-prompt.md`](./nevora-architect-prompt.md).

Nevora Business OS is a **multi-tenant SaaS platform** for freelancers and small
business, built as a **Modular Monolith** on Next.js 16 (App Router) + Supabase
(PostgreSQL + Auth + RLS). One production application at the repository root
serves every module; the three products — Tasks, Finance (Money) and
Subscriptions — sit behind ports so each can also run as a standalone service
under `apps/*` (ADR 001). Tenant isolation is enforced in the database, not only
in code.

> Last reviewed 2026-09-29 against `main`.

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
- **Service role only where there is no user session, or where RLS cannot
  express the operation — always scoped by an organization/user taken from a
  verified context.** Session-less surfaces: cron sweeps, channel webhooks
  (after signature verification and identity mapping), the internal service
  routes for `apps/*`, the billing webhook, the rate limiter. Deliberate
  in-session exceptions: issuing an email-forwarding address, storing encrypted
  Gmail tokens, the account-deletion guard and purge, activation metrics. Any
  new use must be added to this list in the same PR.
- **No client-trusted `organization_id` / `workspace_id`.** They come from the
  session via `requireOrg()` — never from `formData` or query params.
- **Mutations are Server Actions** (`"use server"`), not `app/api/` route
  handlers. Route handlers exist only for public/internal/webhook/cron surfaces,
  and every machine-facing path must be listed in `MACHINE_ROUTES`
  (`shared/config/routes.ts`) or `proxy.ts` redirects it to `/login`.
- **Products do not bridge.** Tasks, Money and Subscriptions do not import one
  another or write each other's tables (enforced by ESLint); nothing outside
  Money posts a transaction (migration `115`).
- **No raw SQL string interpolation.** Use the Supabase client / RPC with
  parameters.
- **No `any` in TypeScript.** Describe interfaces/types.

## Target architecture

```
Business OS
├── Core          — auth, organizations, workspaces, context, permissions
├── Capture       — Inbox + channels (app, Telegram, Slack, email) → drafts → confirm
├── Modules       — vertical business domains (tasks, money, documents, …)
├── Product ports — platform/* seams; products can run in-process or as apps/*
├── Event Layer   — domain_events + automation dispatch (engine/handlers)
├── Security Layer — RLS policies, SECURITY DEFINER RPC, grants, rate limiting
├── SaaS Layer    — billing, trials, plan limits, members/invites
└── AI Layer      — capture intent, document/receipt extraction (Anthropic),
                    voice transcription (OpenAI); drafts only, metered per org
```

## Application-layer rules

```
app/      = routing and composition layer (pages, layouts, route handlers)
apps/     = standalone product services (tasks, subscriptions, finance)
packages/ = per-product contracts / api / runtime + financial-state
platform/ = product-neutral ports and transport seams between products
modules/  = business / domain layer (vertical feature modules)
features/ = UI feature compositions that wire module data into screens
shared/   = reusable infrastructure and UI (routes, i18n, ui kit, utils)
lib/      = cross-cutting infra: supabase clients, auth, env, events,
            rate-limit, billing, entity-links, http helpers
entities/ = low-level domain models
store/    = Redux store + provider (client UI state only)
db        = supabase/migrations/ — schema, RLS, RPC, indexes, grants
netlify/  = Scheduled Functions that trigger the /api/cron/* routes
```

`proxy.ts` is the Next.js 16 proxy (the former `middleware`): it handles auth
gating and redirects. See `AGENTS.md` — read `node_modules/next/dist/docs/`
before touching Next internals, this is not the Next.js in your training data.

## Cross-module relations

Modules are linked through the **`entity_links`** table
(`source_type/source_id → target_type/target_id`), not direct foreign keys
between business tables — for example a document linked to a task or to a
subscription. The `relations` module and Action Center build on top of
`entity_links`. Links are informational: since migration `115` no link causes
one product to write into another (the old subscription → transaction `paid_by`
posting path is gone).

## Product boundaries (ADR 001)

Each product has `*-contracts` (pure types), `*-api` (port + HMAC service auth)
and `*-runtime` (Supabase implementation) packages. The root app reaches a
product through `platform/<product>/server.ts`, whose `*_TRANSPORT` switch moves
calls from `in-process` → `shadow` → `http-read` → `http`. Production runs Tasks
in `shadow`; Subscriptions and Finance are `in-process`. See
[`adr/001-product-module-boundaries.md`](./adr/001-product-module-boundaries.md).

## Capture (ADR 002)

Every channel ends in the same pipeline: `planner_entries` → AI intent →
`planner_suggestions` (or `financial_suggestions` for receipts) → review in the
Inbox → accept through the owning module. A channel adapter only verifies the
request, maps the external identity to organization/workspace/actor and hands
off. Nothing arriving from a channel changes business data without Accept. See
[`adr/002-multichannel-task-capture.md`](./adr/002-multichannel-task-capture.md).

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
- No raw SQL interpolation; service role only as listed in the hard rules.
- No cross-tenant data access — `organization_id`/`workspace_id` from session.
- `SECURITY DEFINER` functions pin `search_path` and have an explicit
  `GRANT EXECUTE` model (`035_*`, `037_*`).

See [`SECURITY.md`](./SECURITY.md) for the per-change checklist.
