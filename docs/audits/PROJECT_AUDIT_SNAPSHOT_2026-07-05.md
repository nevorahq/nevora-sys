# Project Audit Snapshot — Nevora Business OS

**Date:** 2026-07-05
**Type:** Read-only factual audit (no code/schema/logic changes made)
**Source of truth:** `NEVORA_BUSINESS_OS_CONSOLIDATED_ROADMAP_2026-07-05 (1).md`
**Method:** direct inspection of routes, modules, migrations, services, actions, tests, docs.

---

## Executive Summary

Nevora Business OS is a mature multi-tenant SaaS core. The **active scope**
(Tasks, Projects, Money, Documents, Subscriptions, Settings, Members, Billing,
Relations, Action Center, Notifications, Automation, Domain Events, Analytics,
AI Assistant, Developer Access) is implemented end-to-end with RLS, server-side
org resolution, Zod validation, and a broad test suite (~120 test files).

The **non-negotiable financial and AI invariants hold** and are regression-tested:
drafts are `planned` (never posted) until explicit confirmation, subscription
creation and document attachment create no Money transaction, AI only suggests,
and `mark all as read` touches delivery state only.

The codebase has **run ahead of the roadmap's phase sequencing**: Phase 10.2
(Subscription Payment Workflow), 10.3 (Financial Context Tasks) and 11 (Capture
Inbox) are implemented (migrations 078–080 present) even though the roadmap still
lists them as *Designed* and gates them behind Phase 7 closure. Meanwhile
**Phase 7 operational closure and Phase 8 operations documentation are the real
gap** — the Operations Manual, runbooks, and smoke/beta reports do not exist in
the repo.

Two scope-hygiene risks: **CRM and Booking pages remain live and URL-reachable**
(hidden from the sidebar only), and **landing pricing copy still sells CRM /
Deals / Clients as paid quota features** while those modules are paused.

---

## Active Modules (implemented)

| Module | Status | Evidence |
|---|---|---|
| Dashboard | implemented | `app/(dashboard)/dashboard/page.tsx`, sidebar `shared/ui/sidebar.tsx:49` |
| Tasks | implemented | `modules/tasks/*`, routes `dashboard/tasks`, `tasks/[taskId]`, 3-state status (mig 055), assignees (056), smart sort (061), due-date history (064) |
| Projects | implemented | `modules/tasks/projects/*`, route `tasks/projects/[projectId]`, migration 060 |
| Money | implemented | `modules/moneyflow/*`, routes `dashboard/money`, `/accounts`, `/rules`, migrations 041/057/067/069/070 |
| Documents | implemented | `modules/documents/*`, private uploads (039), extraction pipeline, routes `dashboard/documents/*` + `api/documents/*` |
| Subscriptions | implemented | `modules/subtracker/*`, route `dashboard/subscriptions/[subscriptionId]`, payment cycles (078) |
| Settings | implemented | `modules/settings/*`, routes `settings/{profile,workspace,members,billing,plans,notifications,developer}`, migration 065/066 |
| Members | implemented | `modules/members/*`, invites (025/026), seat atomicity (076) |
| Billing / Plans / Limits | implemented | `modules/billing/*`, atomic usage (072), plan enforcement (033/071), trial lifecycle (024/027) |
| Relations | implemented | `modules/relations/*`, `entity_links` layer (047), paused-kind exclusion tested |
| Action Center | implemented | `modules/action-center/*`, route `dashboard/actions`, migration 048 + counters 082–084 |
| Notifications | implemented | `modules/notifications/*`, delivery (073), tab indicator (074), reminders (075), policy in `NOTIFICATION_POLICY.md` |
| Automation / Domain Events | implemented | `modules/automation/{engine,handlers,logs}`, `lib/events/*`, foundation (040/042) |
| Analytics | implemented | `modules/analytics/*`, route `dashboard/analytics`, layer (010) |
| AI Assistant | implemented | `modules/ai/*`, route `dashboard/ai`, AI layer (011), money suggestions (069) |
| Developer Access | implemented | `modules/developer/*`, route `settings/developer`, unlimited-access (059), phase6 (071), `api/v1/me` |

## Paused Modules (present, gated by nav-hiding only)

| Module | Status | Evidence | Note |
|---|---|---|---|
| CRM / Leads / Clients / Deals / Contacts / Pipelines | paused_in_code | `modules/crm/*`, `app/(dashboard)/dashboard/crm/page.tsx` renders live data via `getClients/getDeals/...` | **Not** in sidebar; **but route is live & URL-reachable, not gated** |
| Booking | paused_in_code | `modules/booking/*`, `dashboard/booking/*`, **public** `app/booking/[organizationSlug]/*` | Sidebar entry commented out (`sidebar.tsx:58`); dashboard + public routes still live (public gated by `public_enabled`) |

## Ahead-of-roadmap Implemented Capabilities

| Capability | Roadmap says | Actual | Evidence |
|---|---|---|---|
| Subscription Payment Workflow (10.2) | Designed | implemented | `modules/subtracker/services/mark-subscription-payment-as-paid.ts` (atomic RPC, idempotent), migration 078, tests |
| Financial Context Tasks (10.3) | Designed | implemented | route `tasks/financial`, `get-financial-tasks`, `financial-task-keys`, `detect-financial-obligation`, migration 079 |
| Capture Inbox (11) | Designed | implemented | `modules/planner/*`, route `dashboard/inbox`, migration 080, `planner-suggestion.schema`, `map-suggestion-to-action-item` |
| Trial Abuse Guard | Designed | implemented | `billing_trial_claims` (086), `modules/billing/services/trial-eligibility.ts`, `consume-expired-trials.ts`, cron `trial-sweep` |

## Partially Implemented

| Capability | Ready | Missing | Evidence |
|---|---|---|---|
| Manual Currency Rates (10.1) | base currency + `exchange_rates` table + FX read layer (`fn_get_exchange_rate` used in `get-money-summary.ts`) | Settings management UI, rate-entry action, Money widget, audit of rate changes | migrations 049/050; no `insert exchange_rates` action anywhere; no Settings currency component |
| Automation Observability (12) | structured logging (`docs/observability/logging-and-errors.md`), automation logs, 5 crons | async queue/dead-letter, **usage-counter reconciliation job** (none found), SLOs, cron execution history UI | grep for `reconcil` returns no job |

## Missing Capabilities (vs roadmap)

| Capability | Roadmap phase | Evidence of absence |
|---|---|---|
| Operations Manual | Phase 8 | `docs/OPERATIONS_MANUAL.md` MISSING |
| Runbooks (8 files) | Phase 8 | `docs/runbooks/` directory MISSING |
| `docs/contracts/notification-lifecycle.md` | Phase 8 | only `docs/contracts/domain-events.md` exists (policy lives in root `NOTIFICATION_POLICY.md`) |
| `docs/contracts/financial-workflows.md` | Phase 8 | MISSING |
| Production smoke-test **report** | Phase 7.13 | checklist exists (`docs/release/phase-7-release-checklist.md`), no executed report |
| Beta **report** | Phase 7.13 | `phase-7-beta-launch-plan.md` exists, no beta result report |
| Currency management UI | Phase 10.1 | see above |
| Usage-counter reconciliation job | Phase 12 | see above |

---

## Invariant Compliance (evidence)

| Invariant | Compliant? | Evidence | Confidence |
|---|---|---|---|
| planned obligation ≠ posted transaction | Yes | `create-draft-transaction-from-document.ts:117` inserts `status:'planned'`; confirm is separate | high |
| document detection ≠ payment | Yes | extraction produces `planned` draft only; `confirm-document-transaction.action.ts` is the sole posting path (`data.write` gated) | high |
| subscription creation ≠ transaction | Yes | `create-subscription.action.test.ts:88` asserts `from` never called with `money_transactions`, no `money.transaction.created` event | high |
| document attachment ≠ transaction | Yes | `create-subscription-document-with-attachments.ts:32` "cannot create a Money draft or transaction" | high |
| AI suggestion ≠ accounting fact | Yes | `review-ai-suggestion.action.ts` only updates `category_id`; no insert into `money_transactions`; requires `canDo(ctx,'data.write')` | high |
| task completion ≠ payment unless "Mark as paid" | Yes | `mark-subscription-payment-as-paid.ts` explicit + idempotent RPC `mark_subscription_payment_paid` | high |
| Mark all as read ≠ resolve obligation | Yes | `notification-read.actions.ts:23` calls `mark_all_visible_notifications_read` (read-state RPC only); counters keep delivery vs obligation separate (`counters.test.ts:5`) | high |
| Active org resolved server-side | Yes | `lib/auth/resolve-active-organization.ts` (+ tests); `requireOrg`/`require-org.ts` | high |
| Service role not in application logic | Mostly | `lib/supabase/service-role.ts` used only by background jobs (crons/sweeps/workers), not interactive request handlers | high |
| Wrong-org detail page → safe not-found | Likely (RLS) | queries scoped `.eq('organization_id', ctx.org.id)`; **no dedicated unit test** for cross-org not-found | medium |

---

## Risky Areas

1. **Live paused-module routes** — `dashboard/crm` and `dashboard/booking` render real data; `booking/[organizationSlug]` is public. Hidden from nav ≠ inaccessible. (evidence: pages import and query live services; no redirect/gate). **Risk: paused features reachable/indexable in a release.**
2. **Landing pricing sells paused features** — `modules/landing/constants/landing-content.ts` lists "Up to 100 CRM clients", "Deals pipeline", "Full CRM", "Clients and contacts" as plan quotas (lines ~104,139,148–150,177,288–290). **Risk: marketing/legal mismatch with paused scope.**
3. **Phase sequencing inversion** — 10.2/10.3/11 shipped (migrations 078–080) while Phase 7 operational closure (docs, smoke/beta reports) is unfinished. Release checklist is pinned at migration 077 and does not mention 078–086. **Risk: release artifacts describe a state that no longer matches the tree.**
4. **Currency FX read layer without management UI** — `get-money-summary.ts` reads `fn_get_exchange_rate`, but no way to enter/audit rates. **Risk: FX values are undefined/stale in production.**
5. **No usage-counter reconciliation job** — atomic reservation exists (072) but nothing repairs drift (Phase 12). **Risk: counter drift accumulates silently.**
6. **Cross-org not-found not unit-tested** — relies on RLS + `.eq(organization_id)`; no regression test proving a foreign detail page returns not-found.

---

## Recommended Next Investigation

- Confirm on the **remote DB** which of migrations 078–086 are actually applied (per project memory: 078/079 created-not-applied, 080/086 applied).
- Verify production env: `CRON_SECRET`, `DOCUMENT_EXTRACTION_MOCK=off`, VAPID/Resend/Anthropic keys.
- Run the billing reconciliation query (orgs without `billing_subscriptions`) and capture the result as evidence.
- Decide gating policy for `dashboard/crm` + `dashboard/booking` routes before public launch.
