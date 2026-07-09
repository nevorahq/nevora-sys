# Module Status — Nevora Business OS

> Honest snapshot of what is actually implemented, verified against the
> repository on **2026-07-08** (Phase A). Status legend:
> `Not Started` · `Planned` · `In Progress` · `Partial` · `MVP Ready` ·
> `Paused` · `Needs Refactor` · `Blocked`.
>
> A module is **not** called production-ready unless it has RLS, permission
> checks, server-side Zod validation, a stable build, and a clear data model.
> "MVP Ready" here means: functional end-to-end with those guarantees, but not
> yet hardened/feature-complete.

## Status Definitions

**MVP Ready** means the module is usable within the current repository scope and
passes the current project checks (typecheck, lint, test, build).

It does **not** mean the module is final, fully automated, monetized,
feature-complete or production-complete.

A module can be MVP Ready and still require:

- deeper automation
- stronger analytics
- improved UX
- additional tests
- billing / plan restrictions
- advanced permissions
- production hardening

So `Tasks`, `Money`, `Documents` and `Settings` being **MVP Ready** does **not**
mean they are "done" — it means they work end-to-end today with the security
guarantees above, with hardening and depth still ahead.

Other statuses: `Partial` — works but incomplete surface; `In Progress` — active
foundation, not user-complete; `Paused` — implemented or partial but
intentionally not the current focus and hidden from active scope; `Planned` /
`Not Started` — not built yet; `Needs Refactor` / `Blocked` — flagged for rework
or waiting on a dependency.

## Current product direction

Nevora is an **AI-assisted operating desk for small businesses** — not a broad
mini-ERP. It turns documents, subscriptions, payments, tasks and AI suggestions
into a clear daily action list, and the user confirms before business data changes.

- **The Action Center is the product's primary screen.** As of Phase A,
  `/dashboard` *is* the Action Center. The generic metrics roll-up moved to
  `/dashboard/overview` and is secondary. `/dashboard/actions` 307s to `/dashboard`.
- **CRM / Clients is Paused and hard-gated.** Not merely hidden: its pages,
  Server Actions **and** route handlers return 404 / reject server-side.
- **Booking is Paused and closed at BOTH surfaces.** `/booking/*` and
  `/api/public/booking/*` return 404 (the Next.js surface), and since `098` the
  database surface is closed too. Before `098`, a closed route was *not* a closed
  data surface: the `anon` SELECT policies from `016` left `booking_pages`,
  `booking_host_profiles`, `booking_services` and `booking_host_services` readable
  straight from Supabase REST with the public anon key (3 pages / 3 orgs; host
  profiles exposed `display_name`, `avatar_url`, `user_id`, `membership_id`), and
  `anon` retained `EXECUTE` on the `SECURITY DEFINER` RPC
  `create_booking_request_public` — an anonymous **write** path into
  `booking_requests`. `098` (applied on remote, confirmed 2026-07-09) dropped the
  anon policies, revoked anon table privileges and revoked anon EXECUTE on both
  public booking RPCs. Verified: anon now gets `42501` on every booking table and
  both RPCs. Data preserved; `authenticated` untouched; Booking not reactivated.
- Paused modules are removed from the active public product promise: no landing
  copy, no pricing entitlement, no navigation entry.
- Priority focus is the **Business OS foundation**: Action Center, Tasks, Money,
  Documents, Subscriptions, Capture Inbox, and confirm-first financial workflows.

Gate implementation: `shared/config/paused-modules.ts`
(`assertPausedModuleEnabled` for pages, `assertPausedModuleAction` for Server
Actions, `pausedModuleGuard` for route handlers). Re-enable per environment with
`NEVORA_ENABLE_CRM` / `NEVORA_ENABLE_BOOKING`; both must be unset in production.
Coverage is enforced by `shared/config/paused-modules.coverage.test.ts`, which
scans the tree so a *newly added* ungated file fails CI.

| Module | Status | In nav |
| --- | --- | --- |
| Auth / Organizations / Workspaces | MVP Ready | core |
| Action Center | MVP Ready | **yes — `/dashboard` (primary)** |
| Dashboard Overview | MVP Ready | yes — `/dashboard/overview` (secondary) |
| Tasks | MVP Ready | yes |
| Financial Tasks | MVP Ready | under Tasks |
| Money (moneyflow) | MVP Ready | yes |
| Money Intelligence | Partial | within Money |
| Documents | MVP Ready | yes |
| Subscriptions (subtracker) | MVP Ready | yes |
| Subscription Payment Workflow | MVP Ready | within Subscriptions |
| Capture Inbox (planner) | MVP Ready | yes — `/dashboard/inbox` |
| Settings | MVP Ready | yes |
| Members | Partial | under Settings |
| Billing | Partial | under Settings |
| Developer Access | Partial | under Settings |
| Analytics | Partial | yes |
| AI | Partial | yes |
| Notifications | MVP Ready | bell |
| Relations (cross-module) | In Progress | — |
| Automation | In Progress (foundation) | — |
| **Booking** | **Paused (hard-gated, incl. public)** | no |
| **CRM / Clients / Leads / Deals / Contacts / Pipelines** | **Paused (hard-gated)** | no |

---

## Auth / Organizations / Workspaces

Status: **MVP Ready** (core foundation)
Current implementation: session context via `requireUser()` / `requireOrg()` →
`CurrentContext`; org + workspace scoping; `proxy.ts` auth gating; invite/onboarding flows.
Routes: `/login`, `/register`, `/onboarding`, `/invite/[token]`.
Database: organizations, workspaces, profiles, memberships, invites; RLS helpers
`is_org_member()` / `is_org_admin()`; SECURITY DEFINER provisioning RPC.
Server Actions / API: auth + onboarding actions; `accept_invite` / invite-link RPC.
Known Issues: none blocking; relies on Supabase Auth.
Risks: central blast radius — a context/RLS regression affects every module.
Next Step: keep covered by `lib/context` and `routes` tests; no changes in Phase 0.

## Tasks

Status: **MVP Ready**
Current implementation: 12 actions, 9 queries, 5 components; list + detail +
projects; three-state status, monthly recurring, assignees + activity, smart
sort, due-date change history.
Routes: `/dashboard/tasks`, `/dashboard/tasks/[taskId]`, `/dashboard/tasks/projects`.
Database: migrations `034` (recurring), `055` (three states), `056` (assignees),
`060` (projects), `061` (smart sort), `064` (due-date history).
Server Actions / API: task CRUD + status/sort/assignee actions; `api/tasks/[taskId]/document`.
Known Issues: migration `064` may not be applied on the remote Supabase env yet
(operational follow-up — see [`ROADMAP.md`](./ROADMAP.md); does not block Phase 0).
Risks: recurring-task generation correctness across timezones.
Next Step: verify `064` on remote; add coverage for recurrence edges.

## Money (moneyflow)

Status: **MVP Ready** (most mature module)
Current implementation: 22 actions, 10 queries, 17 components; accounts,
transactions, categories, transfers, summaries; multi-currency with historical
FX; document-to-transaction drafts; smart expense categories.
Routes: `/dashboard/money`, `/money/[transactionId]`, `/money/accounts/[accountId]`.
Database: `041` (tx status), `049` (base currency), `050` (exchange rates),
`051`/`052` (document→tx + AI extraction), `053`, `057`, `058`, `062`, `063`, `067` (transfers).
Server Actions / API: large action surface, broad Vitest coverage (services, classifier, transfers).
Known Issues: FX rates require a populated `exchange_rates` table.
Risks: accounting immutability — never re-price historical amounts.
Next Step: balance-integrity hardening; keep cross-currency sums behind FX layer.

## Documents

Status: **MVP Ready**
Current implementation: 10 actions, 3 queries, 9 components; private uploads,
versions/snapshots, soft delete, AI extraction (OCR/vision) → transaction drafts.
Routes: `/dashboard/documents`, `/documents/new`, `/documents/[documentId]`.
Database: `039` (private uploads), `044`/`045`/`046` (snapshot + soft-delete RLS),
`051`/`052` (extraction).
Server Actions / API: document actions; `api/documents/upload`, `api/documents/[id]/attachments`, cron `extraction-sweep`.
Known Issues: extraction depends on `ANTHROPIC_API_KEY` (mockable via `DOCUMENT_EXTRACTION_MOCK`).
Risks: storage RLS correctness for private buckets; cron auth (`CRON_SECRET`) must be fail-closed.
Next Step: extraction reliability + retry/backoff observability.

## Subscriptions (subtracker) + Subscription Payment Workflow

Status: **MVP Ready**
Current implementation: 8 actions, 4 queries, 10 components, 12 services;
subscriptions, upcoming renewals, next-billing-date calculation, and the managed
payment workflow (planned cycle → payment task → Mark as paid → expense + advance
+ next cycle).
Routes: `/dashboard/subscriptions`, `/subscriptions/[subscriptionId]`.
Database: subscriptions schema; `078_subscription_payment_cycles` (cycles +
`mark_subscription_payment_paid` RPC); links to money via `entity_links` (`paid_by`).
Server Actions / API: create/manage subscription, `markSubscriptionPaymentAction`;
`api/subscriptions/[id]/document`; cron `subscription-sweep`.
Invariants (see `docs/contracts/financial-workflows.md`):
- Creating a subscription posts **no** money transaction.
- Attaching a document posts **no** money transaction.
- **Mark as paid is idempotent** — `FOR UPDATE` row lock + `status='paid'` early
  return + `UNIQUE (organization_id, idempotency_key)`. A double click cannot
  create a second expense.
- `subscription-sweep` is repair-only; it never marks anything paid.
Known Issues: legacy `renewSubscriptionAction` still exists; its quick-renew button
is hidden when a managed cycle exists (avoids a double `next_billing_date` advance).
Risks: renewal date math across billing cycles; anchor-day preservation when paying late.
Next Step: broaden lifecycle actions (pause/resume); stamp payment tasks with
`task_context_type` so they surface in the Financial Tasks view.

## Settings

Status: **MVP Ready**
Current implementation: 8 actions, 4 queries, 10 components; profile, workspace,
members, billing sub-pages; avatar storage.
Routes: `/dashboard/settings` + `/profile`, `/workspace`, `/members`, `/billing`.
Database: `065` (settings module), `066` (avatar storage).
Server Actions / API: settings actions with Zod schemas (avatar schema tested).
Known Issues: some settings panels are read/edit-light.
Risks: avatar storage RLS; workspace rename side effects.
Next Step: round out org-level settings surface.

## Members

Status: **Partial**
Current implementation: 6 actions, 2 queries (UI lives in `features/` + Settings);
invitations, invite links, removal policy with owner guard.
Routes: `/dashboard/settings/members`.
Database: `028`–`032` (contact details, removal policy/guard, profile policies).
Server Actions / API: invite/accept/decline, remove member, contact-details RPC.
Known Issues: no dedicated module components (composed in features/settings).
Risks: removal/owner-guard edge cases; cross-tenant invite leakage.
Next Step: role management UX; per-seat billing alignment.

## Billing

Status: **Partial**
Current implementation: 3 actions, 5 queries, 3 components; trial lifecycle,
plan-limit enforcement, developer unlimited access, trial banner.
Routes: `/dashboard/settings/billing`.
Database: `027` (trial lifecycle), `033` (start-plan enforcement), `059` (dev unlimited access).
Server Actions / API: trial/plan actions; document processing, AI suggestions
and storage upload now pass through Phase D `featureGateService` / `usageService`
boundaries.
Known Issues: Paddle is the only paid billing provider, but checkout, final
webhook verification, and Customer Portal still need the dedicated Paddle
implementation pass. The repository default is explicit **Private Beta**
(`BILLING_MODE=private_beta`), so paid self-serve checkout and Customer Portal
are intentionally disabled until Paddle runtime config and smoke tests are
complete.
Risks: legacy `checkPlanLimit` paths still exist in older product surfaces and
must be retired gradually. Paid plan activation must continue to happen only
through verified provider webhooks, never checkout redirects.
Next Step: finish Paddle checkout/webhook/portal, configure sandbox env outside
the repo, run webhook smoke, then switch `BILLING_MODE=paid_beta`.

## Analytics

Status: **Partial**
Current implementation: 3 actions, 5 queries; dashboard metrics, activity
timeline, per-module stats. Real page (~255 lines), not a stub.
Routes: `/dashboard/analytics`.
Database: reads across module tables + `domain_events`; no dedicated schema.
Server Actions / API: analytics queries/actions.
Known Issues: metrics depend on data volume in other modules.
Risks: query cost as data grows (no caching layer yet).
Next Step: aggregation/caching; richer charts.

## AI

Status: **Partial**
Current implementation: 4 actions, 3 queries; insights + recommendations via
Anthropic SDK; generate/dismiss flows. Real page (~196 lines).
Routes: `/dashboard/ai`.
Database: insights/recommendations storage.
Server Actions / API: trigger generate insights/recommendations, dismiss.
Known Issues: requires `ANTHROPIC_API_KEY`; no streaming UI; scope is summaries/recommendations only.
Risks: cost/latency of generation; avoid overpromising autonomy in copy.
Next Step: scheduled generation; broaden insight sources via domain events.

## Relations (cross-module)

Status: **In Progress**
Current implementation: 3 actions, 2 queries, 6 components, events; built on
`entity_links` (not a separate `entity_relations` table).
Routes: surfaced inline within module screens (no standalone page).
Database: `047` (entity relations layer over `entity_links`), applied + smoke-tested.
Server Actions / API: link/unlink + relation queries.
Known Issues: UX for managing links is partial.
Risks: link integrity when source/target rows are deleted.
Reverse navigation: Documents now show reverse linked entities through
`UniversalRelationViewer`. A document linked from a subscription displays the
related subscription on the document detail page. Bidirectional `entity_links`
are resolved from the document side; unavailable/deleted targets are dropped
without crashing the page (`fetchEntityRelations`).
Scope: Relations scope currently covers active modules only: Tasks, Money,
Documents and Subscriptions. CRM / Leads / Clients / Deals remain paused and out
of scope. Future relation expansion must stay limited to active modules unless a
paused module is explicitly reactivated by product decision.
Resolver: relation resolver metadata (entity kind → table / route / label) is
centralized in a single `RELATION_ENTITY_CONFIG` source of truth; hydration,
search and route generation all derive from it. `verifyEntityOrganization` fails
closed for any entity type outside the active set (paused CRM types are no longer
mapped). Covered by `relation.constants.test.ts` and
`verify-entity-organization.test.ts`.
Next Step: consistent relation UI across Tasks/Money/Documents/Subscriptions.

## Action Center

Status: **MVP Ready** — the product's primary operating screen
Current implementation: 11 actions, 9 queries, 11 components, services;
orchestration layer normalizing module signals into `action_items`; summary strip
(Needs Attention / Due Today / Upcoming / Overdue / Snoozed / Recently Resolved),
grouped feed, detail drawer, activity log.
Daily-screen sections (§9): **Needs your review / Money attention / Next actions /
Recently updated**. Money attention is a pure per-item regrouping in
`services/phase-b-sections.ts` — an item is financial when its type is
payment/renewal or its source/primary entity is a transaction or subscription — so
"what money needs attention today?" is answerable at a glance. No new data model,
org-scoped like the rest of the feed, and read ≠ resolved still holds (a money item
leaves the section only on an explicit resolve/dismiss).
Routes: **`/dashboard`** (primary; thin composition over `modules/action-center`).
`/dashboard/actions` remains as a 307 redirect for old bookmarks and for
`notifications.target_url` values already persisted in the database.
Database: `048` (action center), counters via `075`/`082`/`083`/`084`.
Server Actions / API: confirm/dismiss/resolve/snooze/assign/execute action items.
Known Issues: `syncActionItems()` runs best-effort on page load (idempotent,
wrapped in try/catch) — now on the most-visited route. Cron-based generation
remains the intended long-term source.
Invariant: an action item's lifecycle is **independent of notification read
state**. See `docs/contracts/notification-lifecycle.md`.
Risks: signal normalization correctness across modules; sync latency on first load.
Next Step: move generation fully to cron; restructure feed sections around
Requires Confirmation / Due Soon / Overdue / Money Attention / Inbox.

## Automation

Status: **In Progress (foundation)**
Current implementation: domain-event dispatch engine (`engine/`), handlers
(`handlers/on-document-created`, …) with tests, and a logs layer. No actions/
queries/components yet — it is plumbing, not a user-facing module.
Routes: none (event-driven).
Database: `040`/`042` (automation foundation + hardening).
Server Actions / API: invoked from the event layer, not directly by users.
Known Issues: handler coverage is partial; no user-facing rules engine.
Risks: double-counting if a table both emits via service and trigger.
Next Step: expand handlers; consider a user-facing automation rules layer (later phase).

## Booking

Status: **Paused — hard-gated, including the public surface**
Booking exists in the codebase but is **not part of the active product promise**
and is not reachable in production. It is not advertised, not in navigation, not
in pricing.
Current implementation: public online booking — hosts, services, availability
rules, slot calculation, requests; 11 components, 5 dashboard pages.
Routes (all 404 while paused):
- `/dashboard/booking[/hosts|/services|/availability|/requests]` — gated at
  `app/(dashboard)/dashboard/booking/layout.tsx`
- public `/booking/[organizationSlug][/hostSlug]` — gated at `app/booking/layout.tsx`
- `api/public/booking/*` (6 routes) + `api/internal/booking/availability-rules` —
  each returns 404 via `pausedModuleGuard("booking")`
- 10 Server Actions — each rejects via `assertPausedModuleAction("booking")`
Database: booking schema; public SECURITY DEFINER RPC resolving org/host/service by slug.
Known Issues:
- **An org that published a booking page before the pause no longer serves it.**
  Intentional — a paused module must not remain a live public product surface.
- ⚠️ **The app-layer gate does not cover the data layer.** Migration `016` grants
  `anon` SELECT on `booking_pages` (policy `booking_pages_select_anon`), so anyone
  holding the *public* anon key can still enumerate published booking pages
  straight from the Supabase REST endpoint — bypassing Next.js entirely. Verified
  2026-07-08: 3 rows with `public_enabled = true` are readable. This predates
  Phase A and is not a regression, but it means "Booking is fully gated publicly"
  is true of the **application**, not of the **database**.
  To close, pick one (needs a product decision):
  1. set `public_enabled = false` on those rows (data change, reversible), or
  2. drop/narrow the `anon` SELECT policy on booking + host/service tables
     (migration `094`, must be reverted when Booking un-pauses).
Risks: the residual anon read above. If un-paused, public endpoints are
rate-limited; slot/conflict correctness needs re-verification.
Next Step: **product decision** — keep paused. Un-pausing means: set
`NEVORA_ENABLE_BOOKING`, restore nav + pricing + landing copy, and delete the
Booking block in `paused-modules.coverage.test.ts` in the same PR.

## CRM / Clients / Leads / Deals / Contacts / Pipelines

Status: **Paused — hard-gated**
Current implementation: 9 actions, 7 queries; clients, contacts, leads, deals,
pipeline/stages, activities (UI in `features/crm`).
Routes (404 while paused): `/dashboard/crm` — gated in the page component.
Server Actions: 9, each rejecting via `assertPausedModuleAction("crm")`. This
matters: a `"use server"` export stays reachable over POST even when the page that
renders its form 404s, so gating the page alone left a live mutation surface.
Database: CRM schema + default pipeline RPC. Defense-in-depth already present —
CRM RLS gates writes on `can_write_data()`.
Known Issues: paused per product direction; not maintained as priority.
Risks: drift from the rest of the platform while paused.
Relations: CRM entity types are **not** mapped in `RELATION_ENTITY_CONFIG`;
`verifyEntityOrganization` fails closed for them.
Next Step: keep paused until the Business OS foundation is stabilized.
