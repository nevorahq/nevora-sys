# Module Status — Nevora Business OS

> Honest snapshot of what is actually implemented, verified against the
> repository on **2026-09-29** (`origin/main` @ `673516c`). Previous snapshot:
> 2026-07-08 (Phase A). Status legend:
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

## Snapshot evidence (2026-09-29)

- `tsc --noEmit` clean; `vitest run` — 2219 passed / 3 skipped (261 files);
  GitHub Actions `CI` (verify + db + secrets) green on `main`.
- Migrations `000`–`125` in the tree; `125` confirmed applied on remote by a
  read-only probe (`054` is a known gap).
- Production (`bussines.nevorahq.com`) and `/api/health` answer 200.
- Open P0/P1: **0** (see [`release/p0-p1-issue-register.md`](./release/p0-p1-issue-register.md)).
  Open GitHub issues: #39 (transfer ownership — unblocks account deletion for owners).

## Current product direction

Nevora is an **AI-assisted operating desk for small businesses** — not a broad
mini-ERP. It turns documents, subscriptions, payments, tasks and AI suggestions
into a clear daily action list, and the user confirms before business data changes.

- **Tasks, Money and Subscriptions are separate products** (ADR 001,
  [`adr/001-product-module-boundaries.md`](./adr/001-product-module-boundaries.md)).
  Since migration `115` they no longer bridge to each other: Financial Tasks are
  gone, and marking a subscription paid does **not** post a Money transaction.
  Each product has its own route prefix (`/tasks`, `/finance`, `/subscriptions`)
  and, behind a transport seam, its own standalone app under `apps/*`.
- **One app shell.** All modules render inside one shell and one sidebar
  (PR #75). The sidebar has exactly eight entries: Action Center, Inbox, Tasks,
  Projects, Money, Subscriptions, Documents, Settings.
- **The Action Center is the primary screen, and read-only.** `/dashboard` *is*
  the Action Center. It owns *attention and routing only*: read-only Attention
  list, six summary **filter** cards (URL `?filter=<key>`, one predicate shared by
  count and list), and a separate Activity Log. It performs **no** business
  mutations — resolve/confirm/complete happen in the owning module (or Inbox
  Review for capture-derived suggestions), and stale items are auto-closed by
  `reconcileStaleActionItems`. `/dashboard/actions` 307s to `/dashboard`.
- **Capture is multichannel** (ADR 002,
  [`adr/002-multichannel-task-capture.md`](./adr/002-multichannel-task-capture.md)):
  in-app text/photo/document/scan, Telegram, Slack and forwarded email all land
  in the same Inbox pipeline, and nothing becomes a task without Accept.
- **CRM / Clients is Paused and hard-gated.** Its pages, Server Actions **and**
  route handlers return 404 / reject server-side.
- **Booking is Paused and closed at BOTH surfaces** — `/booking/*` and
  `/api/public/booking/*` return 404, and since `098` the `anon` database grants
  are revoked too (see the Booking section).
- Paused modules are removed from the active public product promise: no landing
  copy, no pricing entitlement, no navigation entry.

Gate implementation: `shared/config/paused-modules.ts`
(`assertPausedModuleEnabled` for pages, `assertPausedModuleAction` for Server
Actions, `pausedModuleGuard` for route handlers). Re-enable per environment with
`NEVORA_ENABLE_CRM` / `NEVORA_ENABLE_BOOKING`; both must be unset in production.
Coverage is enforced by `shared/config/paused-modules.coverage.test.ts`, which
scans the tree so a *newly added* ungated file fails CI.

### Routes

Canonical product routes moved out of `/dashboard` (`next.config.ts` issues
permanent redirects for the old paths):

| Old | Canonical |
| --- | --- |
| `/dashboard/tasks/*` | `/tasks/*` |
| `/dashboard/money/*` | `/finance/*` |
| `/dashboard/subscriptions/*` | `/subscriptions/*` |
| `/dashboard/settings/*` | `/settings/*` |

Still under `/dashboard`: Action Center (`/dashboard`), Inbox
(`/dashboard/inbox`), Documents, Overview, Analytics, AI.

## Summary

| Module | Status | In nav |
| --- | --- | --- |
| Auth / Organizations / Workspaces | MVP Ready | core |
| Action Center | MVP Ready | **yes — `/dashboard` (primary)** |
| Capture Inbox (planner) | MVP Ready | yes — `/dashboard/inbox` |
| Channels (Telegram / Slack / email) | MVP Ready (text); Partial (media, voice) | Settings → Integrations |
| Tasks + Projects | MVP Ready | yes — `/tasks`, `/tasks/projects` |
| Money (moneyflow) | MVP Ready | yes — `/finance` |
| Money Intelligence (rules, classification) | Partial | within Money (`/finance/rules`) |
| Documents | MVP Ready | yes |
| Subscriptions (subtracker) | MVP Ready | yes — `/subscriptions` |
| Settings | MVP Ready | yes — `/settings` |
| Notifications | MVP Ready | bell |
| Members | Partial | under Settings |
| Billing | Partial (code complete, unproven live) | under Settings |
| Developer Access | Partial | under Settings |
| Integrations — Gmail invoice import | Partial | within Subscriptions |
| Dashboard Overview | MVP Ready | **no** — URL only (`/dashboard/overview`) |
| Analytics | Partial | **no** — URL only |
| AI | Partial | **no** — URL only |
| Relations (cross-module) | In Progress | — |
| Automation | In Progress (foundation) | — |
| Standalone product services (`apps/*`) | In Progress | — |
| ~~Financial Tasks~~ | **Removed** (migration `115`) | — |
| **Booking** | **Paused (hard-gated, incl. public)** | no |
| **CRM / Clients / Leads / Deals / Contacts / Pipelines** | **Paused (hard-gated)** | no |

Overview, Analytics and AI still render and are still gated, but no screen links
to them since the unified sidebar landed. Either link them again or retire them —
today they are reachable only by typing the URL.

---

## Auth / Organizations / Workspaces

Status: **MVP Ready** (core foundation)
Current implementation: session context via `requireUser()` / `requireOrg()` →
`CurrentContext`; org + workspace scoping; `proxy.ts` auth gating; invite/onboarding
flows; product-aware auth entry for the `/tasks`, `/finance` and `/subscriptions` shells.
One organization per account — creating a second one is closed on purpose until
the paid-beta cutover.
Routes: `/login`, `/register`, `/onboarding`, `/invite/[token]`.
Database: organizations, workspaces, profiles, memberships, invites; RLS helpers
`is_org_member()` / `is_org_admin()`; SECURITY DEFINER provisioning RPC;
account deletion requests (`104`) with FK safety (`102`/`103`).
Known Issues: an organization owner cannot delete their account while they own an
org with other members — needs a transfer-ownership action (issue #39).
Risks: central blast radius — a context/RLS regression affects every module.
Machine-facing routes must be listed in `MACHINE_ROUTES` (`shared/config/routes.ts`)
or `proxy.ts` redirects them to `/login`.
Next Step: transfer ownership (#39).

## Action Center

Status: **MVP Ready** — the product's primary operating screen
Current implementation: 11 actions, 7 queries, 14 services; orchestration layer
normalizing module signals into `action_items`; summary filter cards, grouped
feed, detail drawer, activity log. Daily-screen sections: **Needs your review /
Money attention / Next actions / Recently updated** (`services/phase-b-sections.ts`).
Routes: **`/dashboard`** (primary). `/dashboard/actions` is a 307 redirect kept for
old bookmarks and for `notifications.target_url` values already persisted.
Database: `048` (action center), counters via `075`/`082`/`083`/`084`.
Server Actions / API: confirm/dismiss/resolve/snooze/assign/execute; cron
`action-items-sweep`.
Invariant: an action item's lifecycle is **independent of notification read
state**. See `docs/contracts/notification-lifecycle.md`.
Known Issues: `syncActionItems()` still also runs best-effort on page load
(idempotent, wrapped in try/catch) alongside the hourly sweep.
Risks: signal normalization correctness across modules; sync latency on first load.
Next Step: move generation fully to the sweep.

## Capture Inbox (planner)

Status: **MVP Ready**
Current implementation: 8 actions, 4 queries, 13 components, 17 services. Four
in-app capture modes — text, photo, document and **scan** (receipt QR/barcode via
native `BarcodeDetector` or the self-hosted zxing ponyfill). One pipeline:
`planner_entries` → `detectPlannerIntent` → `planner_suggestions` → Inbox review →
`routeAccept` → `tasks.createStandardTask` through the Tasks seam. The detector
proposes only `create_task`; retired financial draft types are still accepted as
plain tasks. Photos/documents without an amount become task drafts from the PDF
text or the model's visible-text transcription; receipts keep the money route
(extraction → `financial_suggestions` → review modal with editable line items).
Captures are classified into a **project**, rule-first then AI: when a user files
a Slack or email capture under a different project, that correction becomes a
private rule for its source (Slack channel, email sender or domain) and the next
capture from there is filed before the model is asked (`capture_project_rules`,
migration `125`; rules listed and deletable in Settings → Integrations). Telegram
and in-app captures carry no source signal.
Routes: `/dashboard/inbox`; `POST /api/inbox/capture`.
Database: `105` (capture idempotency), `119` (`capture_intent` metered against
the shared AI quota), `120` (`documents.capture_code`), `125` (project rules).
Known Issues: the manual "New task" form still uses the older direct insert
(`features/todos`), not the Tasks seam — one of several task-creation paths
outside `routeAccept`. Real fiscal-receipt QR (SFS) format not yet verified on a
physical receipt.
Risks: AI cost on unauthenticated channel traffic (metered before the model call).
Next Step: route the manual task form through the seam; auto-accept for
rule-matched captures is explicitly *not* decided (ADR 002 "confirm-first").

## Channels (Telegram / Slack / email)

Status: **MVP Ready** for text capture; **Partial** for media and voice
Current implementation (`modules/channels`, ADR 002 steps 1–4): one shared intake
(`captureChannelText` / document path) with per-channel adapters that verify the
request, map the external identity to `{organization, workspace, actor}` and hand
off to the Inbox pipeline. Session-less context is rebuilt by
`resolveChannelContext`; document uploads use service-identity usage RPCs.
- **Telegram** (@NevoraHQbot): text, photos/documents, voice. Linking by one-time
  code. Webhook `/api/channels/telegram/webhook` (secret-token header).
- **Slack**: "Send to Nevora" message shortcut (PR #82).
- **Email**: per-user forwarding address `inbox-<token>@<INBOUND_EMAIL_DOMAIN>`
  via Resend Inbound; Svix-signed webhook `/api/channels/email/inbound`; only the
  account owner's address (or Gmail forwarding) is accepted, others are dropped.
Routes: `/settings/integrations` (link/unlink).
Database: `121` (`channel_integrations`, `channel_link_codes`, channel columns on
`planner_entries`), `122` (documents usage for service identity), `123`
(integration metadata, Gmail confirmation code), `124` (`voice_transcription` quota).
Live-verified: Telegram text → accepted task; forwarded email → accepted task.
Known Issues: voice transcription uses OpenAI (`gpt-4o-mini-transcribe`) and the
OpenAI account has no credits — users get "voice temporarily unavailable" and the
reserved quota unit is refunded. Not yet exercised live: Telegram media, email
attachments (PDF invoice → expense draft), Gmail forwarding confirmation.
Channel captures record no domain events (emitters use the cookie client).
Risks: channels bring unauthenticated traffic onto an AI call — every adapter
must verify its signature before any work.
Next Step: live smoke of media/attachments; fund or replace the transcription provider.

## Tasks + Projects

Status: **MVP Ready**
Current implementation: 13 actions, 11 queries, 13 components; list + detail +
projects (with per-project page); three-state status, monthly recurring,
assignees + activity, smart sort, due-date change history. Since `115` Tasks is a
plain to-do list — financial-context columns and `mark_financial_task_paid` are
gone. The list and task-detail pages read through `getTasksApplication`
(`platform/tasks/server.ts`); the project page still reads directly
(`getUnassignedTasks` has no port equivalent).
Routes: `/tasks`, `/tasks/[taskId]`, `/tasks/projects`, `/tasks/projects/[projectId]`.
Database: `034` (recurring), `055` (three states), `056` (assignees), `060`
(projects), `061` (smart sort, recreated in `115`), `064` (due-date history),
`114` (service usage RPC), `115` (financial tasks removed).
Server Actions / API: task CRUD + status/sort/assignee actions;
`api/tasks/[taskId]/document`; `/api/internal/tasks` (HMAC service auth, `nts1.`).
Known Issues: several task-creation paths still bypass the seam (manual form,
action-center drafts, review) — ADR 002 forbids adding new ones.
Risks: recurring-task generation correctness across timezones.
Next Step: converge task creation on the seam; recurrence edge-case coverage.

## Money (moneyflow)

Status: **MVP Ready** (most mature module)
Current implementation: 23 actions, 15 queries, 23 components; accounts,
transactions, categories, transfers (one row), summaries; multi-currency with
historical and per-organization FX rates; document-to-transaction drafts;
canonical financial states (`packages/financial-state`); expense rules and
rule-first classification (private rule → org rule → regex → AI hint → "other").
Routes: `/finance`, `/finance/[transactionId]`, `/finance/accounts/[accountId]`,
`/finance/rules`.
Database: `041` (tx status), `049` (base currency), `050` (exchange rates),
`051`/`052` (document→tx + AI extraction), `053`, `057`, `058`, `062`, `063`, `067`
(transfers), `107`–`109` (org exchange rates, cross-currency transfers, RPC fixes).
Invariants (see `docs/contracts/financial-workflows.md`): one document = one posted
transaction; nothing posts without confirmation; transfers are a single row.
Money no longer receives transactions from Tasks or Subscriptions (`115`).
Known Issues: two subsystems deliberately not yet behind the Finance port —
Zod schemas (`modules/moneyflow/schemas/*`) and the expense-classification engine.
Risks: accounting immutability — never re-price historical amounts.
Next Step: balance-integrity hardening; keep cross-currency sums behind the FX layer.

## Documents

Status: **MVP Ready**
Current implementation: 11 actions, 3 queries, 9 components, 17 services; private
uploads, versions/snapshots, soft delete, AI extraction → transaction drafts;
PDF-with-text-layer parsed without AI, scans/images via Anthropic vision; receipt
codes (EPC/SEPA QR, Swiss QR-bill, SFS fiscal link, EAN) re-parsed server-side and
preferred over the model's header values.
Routes: `/dashboard/documents`, `/dashboard/documents/new`,
`/dashboard/documents/[documentId]`.
Database: `039` (private uploads), `044`/`045`/`046` (snapshot + soft-delete RLS),
`051`/`052` (extraction), `120` (`capture_code`), `122` (service-identity usage).
Server Actions / API: document actions; `api/documents/upload`,
`api/documents/[id]/attachments`, cron `extraction-sweep`.
Known Issues: extraction depends on `ANTHROPIC_API_KEY` (mockable via
`DOCUMENT_EXTRACTION_MOCK`).
Risks: storage RLS correctness for private buckets; cron auth (`CRON_SECRET`) must
stay fail-closed.
Next Step: extraction retry/backoff observability.

## Subscriptions (subtracker)

Status: **MVP Ready**
Current implementation: 10 actions, 5 queries, 15 components, 12 services;
subscriptions, upcoming renewals, next-billing-date calculation, payment cycles,
a **renewal decision inbox** (renew / cancel intent kept separate from payment
state), payment tasks created through the Tasks seam (`createGeneratedTask`), and
invoice import from Gmail.
Routes: `/subscriptions`, `/subscriptions/[subscriptionId]`.
Database: subscriptions schema; `078` (payment cycles — table kept); `116` (Gmail
invoice import); `117` (renewal decisions); `118` (payment reminders restored).
Server Actions / API: create/manage subscription, mark payment paid, apply
renewal decision; `api/subscriptions/[id]/document`; cron `subscription-sweep`.
Invariants:
- Creating a subscription or attaching a document posts **no** money transaction.
- **Mark as paid is local to Subscriptions** since `115`
  (`services/mark-subscription-payment-as-paid.ts`, a guarded UPDATE): it posts
  **no** Money transaction. A user who wants the payment in Money records it there.
- `subscription-sweep` is repair-only; it never marks anything paid.
Known Issues: legacy `renewSubscriptionAction` still exists alongside managed cycles.
Risks: renewal date math across billing cycles; anchor-day preservation when paying late.
Next Step: pause/resume lifecycle actions; retire the legacy renew path.

## Integrations — Gmail invoice import

Status: **Partial**
Current implementation: `modules/integrations/gmail` — OAuth **read-only**,
on-demand import of subscription invoices; tokens encrypted at rest
(`token-crypto.ts`).
Routes: `app/api/integrations/gmail/{connect,callback,status}`.
Database: `116`.
Known Issues: scoped to Subscriptions only; not a general inbox (email capture for
tasks goes through the forwarding channel instead).
Next Step: none planned beyond Subscriptions.

## Settings

Status: **MVP Ready**
Current implementation: 12 actions, 6 queries, 13 components; profile, workspace,
members, billing, plans, notifications, integrations and developer sub-pages;
avatar storage; account deletion with a pending-deletion banner; in-app
confirmation dialogs instead of `window.confirm`.
Routes: `/settings` → `/settings/profile`; `/settings/{workspace,members,billing,
plans,notifications,integrations,developer}`.
Database: `065` (settings module), `066` (avatar storage), `104` (account deletion),
`106` (`en`/`ru`/`ro` language).
Known Issues: some settings panels are read/edit-light.
Risks: avatar storage RLS; workspace rename side effects.
Next Step: round out the org-level settings surface.

## Notifications

Status: **MVP Ready**
Current implementation: 1 action, 3 queries, 7 services; in-app bell, durable
history (`111`), web push (VAPID), mandatory notifications that cannot be hidden,
cron `reminders`.
Known Issues: push is silently off without VAPID keys.
Next Step: none blocking.

## Members

Status: **Partial**
Current implementation: 7 actions, 4 queries, 2 components (UI also in
`features/members` + Settings); invitations, invite links, removal policy with
owner guard.
Routes: `/settings/members`.
Database: `028`–`032` (contact details, removal policy/guard, profile policies).
Known Issues: no role-management UX; no ownership transfer (#39).
Risks: removal/owner-guard edge cases; cross-tenant invite leakage.
Next Step: ownership transfer; role management; per-seat billing alignment.

## Billing

Status: **Partial** — code complete, not proven against a live provider
Current implementation: 4 actions, 9 queries, 4 components, 19 services; trial
lifecycle and trial-identity hardening, plan-limit enforcement through
`featureGateService` / `usageService`, usage reconciliation (`usage-reconcile`
cron, discrepancies persisted in `112`), developer unlimited access. Paddle is
the only provider: checkout (creates a Paddle transaction and returns its URL),
Customer Portal and a webhook with Paddle's `ts=…;h1=…` signature format are all
implemented (PRs #17, #19); paid plans are activated only by the webhook.
Routes: `/settings/billing`, `/settings/plans`, `/pricing`; `/api/billing/webhook`.
Database: `027` (trial lifecycle), `033` (start-plan enforcement), `059` (dev
unlimited access), `092` (webhook idempotency), `100`/`101` (Paddle-only
boundary), `112` (usage discrepancies).
Mode: `BILLING_MODE` defaults to **`private_beta`** — checkout and portal are
off, pricing shows "Available after beta", only the free trial is a real action.
Known Issues: the Paddle path has never run end-to-end against sandbox (webhook
proven by frozen-vector unit tests only). The config guard checks that Paddle vars
are non-empty, not that they are valid. The leaked legacy test key rotation (I-07)
is still owed before public launch.
Risks: legacy `checkPlanLimit` paths remain in older surfaces.
Next Step: real sandbox credentials → checkout → webhook → portal smoke, then
`BILLING_MODE=paid_beta` per [`release/paid-beta-cutover-checklist.md`](./release/paid-beta-cutover-checklist.md).

## Developer Access

Status: **Partial**
Current implementation: 1 action, 1 query, 3 services; unlimited-access flag for
developer accounts (`059`) and its badge in the header.
Routes: `/settings/developer`.
Next Step: none planned.

## Dashboard Overview

Status: **MVP Ready** — but unlinked
Current implementation: the metrics roll-up that moved off `/dashboard` in Phase A.
Routes: `/dashboard/overview` — no navigation entry and no in-app link.
Next Step: link it from the Action Center or retire it.

## Analytics

Status: **Partial** — unlinked
Current implementation: 3 actions, 5 queries; dashboard metrics, activity
timeline, per-module stats.
Routes: `/dashboard/analytics` — no navigation entry and no in-app link.
Database: reads across module tables + `domain_events`; no dedicated schema.
Known Issues: still surfaces CRM metrics although CRM is paused (accepted, listed
in `KNOWN_UNGATED_READS`); no caching layer.
Next Step: product decision — relink or retire.

## AI

Status: **Partial** — unlinked
Current implementation: 4 actions, 3 queries; insights + recommendations via the
Anthropic SDK; generate/dismiss flows. The AI that users actually meet today is
inside Inbox capture and document extraction, not on this page.
Routes: `/dashboard/ai` — no navigation entry and no in-app link.
Governance: AI proposes, the user confirms (`docs/contracts/ai-governance.md`);
every model call is metered against the shared `ai_calls` quota.
Next Step: product decision — relink or retire.

## Relations (cross-module)

Status: **In Progress**
Current implementation: 4 actions, 2 queries, 7 components; built on
`entity_links` (not a separate `entity_relations` table). Relation resolver
metadata is centralized in `RELATION_ENTITY_CONFIG`; `verifyEntityOrganization`
fails closed for any entity type outside the active set. Documents show reverse
links through `UniversalRelationViewer`; deleted targets are dropped without
crashing the page.
Routes: surfaced inline within module screens (no standalone page).
Database: `047` (relations layer over `entity_links`).
Scope: active modules only — Tasks, Money, Documents, Subscriptions. CRM types
are not mapped.
Known Issues: management UX is partial; no changes since the i18n overhaul.
Risks: link integrity when source/target rows are deleted.
Next Step: consistent relation UI across the active modules.

## Automation

Status: **In Progress (foundation)**
Current implementation: domain-event dispatch engine (`engine/`), handlers
(`handlers/on-document-created`, …) with tests, and a logs layer. Plumbing, not
a user-facing module. Unchanged since July.
Routes: none (event-driven).
Database: `040`/`042` (automation foundation + hardening).
Known Issues: handler coverage is partial; no user-facing rules engine;
automation-failure surfacing is ops-only (`/api/internal/job-health`) by choice.
Risks: double-counting if a table both emits via service and trigger.
Next Step: later phase.

## Standalone product services (`apps/*`)

Status: **In Progress** — optional for launch
Current implementation: per ADR 001, each product has `*-contracts`, `*-api`
(HMAC service auth: `nts1.` / `nss1.` / `nfs1.`) and `*-runtime` packages plus a
standalone Next app, and the root app talks to it through a staged transport
seam (`in-process → shadow → http-read → http`).

| Product | App | Deployed | Transport in prod |
| --- | --- | --- | --- |
| Tasks | `apps/tasks` | Netlify staging | `shadow` (10% of reads) — deliberately held here |
| Subscriptions | `apps/subscriptions` | image-publish workflow only | `in-process` |
| Finance | `apps/finance` | no | `in-process` |

Known Issues: shadow compares only reads made through the seam (Tasks list +
detail). Moving past shadow is a product decision (team, load, separate
customers), not an engineering blocker.
Runbooks: [`runbooks/tasks-cutover.md`](./runbooks/tasks-cutover.md),
[`subscriptions-cutover.md`](./runbooks/subscriptions-cutover.md),
[`finance-cutover.md`](./runbooks/finance-cutover.md).

## Booking

Status: **Paused — hard-gated, including the public surface**
Booking exists in the codebase but is **not part of the active product promise**
and is not reachable in production. It is not advertised, not in navigation, not
in pricing.
Current implementation: public online booking — hosts, services, availability
rules, slot calculation, requests; 17 components, 5 dashboard pages.
Routes (all 404 while paused):
- `/dashboard/booking[/hosts|/services|/availability|/requests]` — gated at
  `app/(dashboard)/dashboard/booking/layout.tsx`
- public `/booking/[organizationSlug][/hostSlug]` — gated at `app/booking/layout.tsx`
- `api/public/booking/*` + `api/internal/booking/availability-rules` — each
  returns 404 via `pausedModuleGuard("booking")`
- 10 Server Actions — each rejects via `assertPausedModuleAction("booking")`
Database: booking schema; public SECURITY DEFINER RPC resolving org/host/service by slug.
Known Issues:
- **An org that published a booking page before the pause no longer serves it.**
  Intentional — a paused module must not remain a live public product surface.
- **The former `anon` data-layer leak is closed.** Migration `016` had granted
  `anon` SELECT on the booking tables and EXECUTE on the public booking RPCs.
  Migration `098` (applied on remote, verified 2026-07-09: anon → `42501` on every
  booking table and both RPCs) revoked both. Un-pausing Booking must restore
  those grants deliberately.
Risks: if un-paused, slot/conflict correctness needs re-verification and the `098`
revokes must be reversed.
Next Step: **product decision** — keep paused. Un-pausing means: set
`NEVORA_ENABLE_BOOKING`, restore nav + pricing + landing copy, and delete the
Booking block in `paused-modules.coverage.test.ts` in the same PR.

## CRM / Clients / Leads / Deals / Contacts / Pipelines

Status: **Paused — hard-gated**
Current implementation: 9 actions, 7 queries; clients, contacts, leads, deals,
pipeline/stages, activities (UI in `features/crm`).
Routes (404 while paused): `/dashboard/crm` — gated in the page component.
Server Actions: 9, each rejecting via `assertPausedModuleAction("crm")`. A
`"use server"` export stays reachable over POST even when its page 404s, so
gating the page alone would leave a live mutation surface.
Database: CRM schema + default pipeline RPC; CRM RLS gates writes on `can_write_data()`.
Relations: CRM entity types are **not** mapped in `RELATION_ENTITY_CONFIG`;
`verifyEntityOrganization` fails closed for them.
Known Issues: paused per product direction; not maintained as priority.
Risks: drift from the rest of the platform while paused.
Next Step: keep paused until the Business OS foundation is stabilized.
