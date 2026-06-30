# Module Status — Nevora Business OS

> Honest snapshot of what is actually implemented, verified against the
> repository on **2026-06-30**. Status legend:
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

- **CRM / Clients is Paused.** The module is implemented but hidden from the
  sidebar; it is not the current priority.
- **Booking is built but hidden** from the main sidebar (the nav entry is
  commented out) while focus is elsewhere; the public booking flow still works.
- Priority focus is the **Business OS foundation**: stabilization, Settings,
  Tasks, Money, Documents, Subscriptions, and cross-module automation later.

| Module | Status | In nav |
| --- | --- | --- |
| Auth / Organizations / Workspaces | MVP Ready | core |
| Tasks | MVP Ready | yes |
| Money (moneyflow) | MVP Ready | yes |
| Documents | MVP Ready | yes |
| Subscriptions (subtracker) | Partial | yes |
| Settings | MVP Ready | yes |
| Members | Partial | under Settings |
| Billing | Partial | under Settings |
| Analytics | Partial | yes |
| AI | Partial | yes |
| Relations (cross-module) | In Progress | — |
| Action Center | In Progress | `/dashboard/actions` |
| Automation | In Progress (foundation) | — |
| Booking | Partial | hidden (commented) |
| CRM / Clients | Paused | hidden |

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

## Subscriptions (subtracker)

Status: **Partial**
Current implementation: 5 actions, 3 queries, 8 components; subscriptions +
upcoming renewals + next-billing-date calculation.
Routes: `/dashboard/subscriptions`, `/subscriptions/[subscriptionId]`.
Database: subscriptions schema; links to money via `entity_links` (`paid_by`).
Server Actions / API: create/manage subscription; `api/subscriptions/[id]/document`.
Known Issues: thinner action surface than Money; limited bulk operations.
Risks: renewal date math across billing cycles.
Next Step: broaden lifecycle actions (pause/resume/cancel) and reminders.

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
Server Actions / API: trial/plan actions; limits resolved by `lib/billing`.
Known Issues: no real checkout/payment provider yet (pricing copy is informational).
Risks: limit enforcement must match plan copy on the landing page.
Next Step: integrate a payment/checkout flow; wire `?plan=<id>` from landing.

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
Next Step: consistent relation UI across Tasks/Money/Documents/Subscriptions.

## Action Center

Status: **In Progress**
Current implementation: 8 actions, 5 queries, 9 components, services;
orchestration layer normalizing module signals into `action_items`.
Routes: `/dashboard/actions` (thin composition over `modules/action-center`).
Database: `048` (action center).
Server Actions / API: confirm/dismiss/resolve action items.
Known Issues: not yet in the main sidebar; generation is partly manual.
Risks: signal normalization correctness across modules.
Next Step: cron-based generation of action items; add to primary nav.

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

Status: **Partial / Paused until product decision**
Booking exists in the codebase but is **hidden from navigation and is not part of
the active MVP scope.** The nav entry is commented out; it is not advertised as an
active module.
Current implementation: public online booking — hosts, services, availability
rules, slot calculation, requests; 11 components, 5 dashboard pages.
Routes: `/dashboard/booking[/hosts|/services|/availability|/requests]` (nav entry
commented out); public `/booking/[organizationSlug]/[hostSlug]`.
Database: booking schema; public SECURITY DEFINER RPC resolving org/host/service by slug.
Server Actions / API: `api/public/booking/*`, `api/internal/booking/*`.
Known Issues: hidden from sidebar; not the current priority.
Risks: public endpoints — rate-limited; slot/conflict correctness.
Next Step: **product decision** — return Booking to active scope or keep paused;
keep the public flow tested either way.

## CRM / Clients

Status: **Paused**
Current implementation: 9 actions, 7 queries; clients, contacts, leads, deals,
pipeline/stages, activities (UI in `features/crm`). Hidden from sidebar.
Routes: `/dashboard/crm` (reachable directly, not linked in nav).
Database: CRM schema + default pipeline RPC.
Server Actions / API: CRM CRUD actions.
Known Issues: paused per product direction; not maintained as priority.
Risks: drift from the rest of the platform while paused.
Next Step: keep building until after Business OS foundation is stabilized.
