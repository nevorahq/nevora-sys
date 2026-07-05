# Implemented Features Audit — nevora-sys

> Objective, code-verified inventory of what is actually shipped and reachable by
> a real user. Every claim is backed by a file reference. Nothing here is
> aspirational — features are only marked **Ready** when a full user flow
> (route → UI → server action → DB) was confirmed in the code.
>
> Audit date: 2026-07-05 · Branch: `phase-7-production-hardening-release`

---

## 1. Executive Summary

**nevora-sys** is a Business OS for small business built on Next.js (App Router)
+ Supabase (Postgres, RLS, RPC). The codebase is large and mature: 18 domain
modules, ~110 server actions, 85 SQL migrations, 4 cron jobs, an event-driven
automation engine, and a billing/usage-limit layer with atomic reservations.

**What is production-shaped and reachable from the main sidebar:**

- **Dashboard** — cross-module summary overview.
- **Tasks** — full task management + Projects sub-view.
- **Money** — accounts, transactions, transfers, categories, rules, drafts,
  AI categorization, monthly analytics.
- **Documents** — notes/contracts + file upload + AI extraction (OCR) for
  financial documents.
- **Subscriptions** — recurring-spend tracking + a real payment workflow
  (cycles, mark-as-paid, skip, due-date changes).
- **Analytics** — read-only business metrics dashboard.
- **AI Assistant** — Claude-powered insights & recommendations.
- **Settings** — profile, notifications, workspace, members, billing, plans,
  developer.

**Cross-cutting production-ready systems:**

- **Cross-module relations** — a universal relation viewer wired into all four
  entity detail pages (Task / Money / Document / Subscription), with manual
  create/delete and automatic linking via the automation engine.
- **Billing / usage limits** — plan limits enforced server-side with an atomic
  Postgres reservation RPC + RLS `is_organization_writable` guard; trial banner.
- **Automation** — domain-event bus dispatching to registered handlers; 4 cron
  sweeps (extraction recovery, reminders, subscription payment repair, AI
  suggestion expiry).
- **Notifications** — bell feed, reminders, web-push, dedup, per-user
  preferences.
- **Permissions** — role-based `canDo()` permission set + admin/owner gates +
  RLS at the database layer.

**Partially ready / built-but-not-navigable (foundation):**

- **Action Center** (`/dashboard/actions`) — fully built (feed, filters,
  execute/snooze/dismiss/resolve/assign) but **not in the sidebar**; only
  reachable indirectly through the notification bell.
- **CRM** (`/dashboard/crm`) — a complete CRM (clients, contacts, deals,
  activities, pipeline) exists and Analytics reads from it, but it is **not
  linked in navigation**.
- **Capture Inbox** (`/dashboard/inbox`) — capture → AI suggestion → accept/edit
  /reject flow is built (planner module) but **not linked in navigation**.
- **Financial Tasks** (`/dashboard/tasks/financial`) — built smart view, but the
  Tasks sub-nav does not link to it (orphan route).
- **Booking** — full internal + public booking system exists but is **commented
  out of the sidebar**; only the public `/booking/*` pages and API remain live.
- **Plans / self-serve upgrade** — plan comparison renders, but every upgrade
  button is disabled ("Upgrade coming soon"); no checkout/payment.

**Zones that are foundation/internal only:**

- Developer settings (API keys / webhooks) — described in-product as
  "foundations".
- Analytics report/snapshot/widget server actions — no user UI to trigger them.
- Financial-obligation events and a broad domain-event vocabulary that exceeds
  the handlers actually registered.

---

## 2. User-Available Features

> `Ready` = full reachable user flow verified. `Partial` = works but incomplete
> or awkwardly reachable. `Orphan` = built + functional but no navigation entry
> point. `Admin-only` = gated to owner/admin. `Internal` = no user entry point.

| Module | Feature | User Action | Status | Evidence | Notes |
| ------ | ------- | ----------- | ------ | -------- | ----- |
| Dashboard | Overview | See task/money/subscription summaries + recent tx + renewal alerts | Ready | `app/(dashboard)/dashboard/page.tsx` | Aggregates module summary queries |
| Tasks | Create task | Create task w/ title, due date, project, priority | Ready | `features/todos/actions/create-todo.action.ts`, `app/(dashboard)/dashboard/tasks/page.tsx:33` | Usage-limit gated |
| Tasks | Edit / inline update | Edit task, inline status/field update | Ready | `features/todos/actions/update-todo.action.ts`, `update-task-inline.action.ts` | |
| Tasks | Status (3-state) | Move todo → in-progress → done, reopen | Ready | `modules/tasks/actions/change-task-status.action.ts`, migration `055` | |
| Tasks | Delete | Delete task | Ready | `features/todos/actions/delete-todo.action.ts` | Soft-delete |
| Tasks | Assign | Assign task to org member | Ready | `modules/tasks/actions/assign-task.action.ts`, migration `056` | |
| Tasks | Due-date change history | Change/extend deadline as tracked action | Ready | `modules/tasks/actions/update-task-due-date.action.ts`, migration `064` | |
| Tasks | Comments | Add comment to task | Ready | `modules/tasks/actions/add-task-comment.action.ts` | |
| Tasks | Activity feed | View task activity | Ready | `modules/tasks/actions/load-task-activity.action.ts` | |
| Tasks | Sort | Smart sort ledger | Ready | `modules/tasks/schemas/task-sort.schema.ts`, migration `061` | |
| Tasks | Projects | Create/edit/archive project, assign tasks | Ready | `modules/tasks/projects/actions/*`, `app/(dashboard)/dashboard/tasks/projects/page.tsx`, migration `060` | Reachable via Tasks sub-nav |
| Tasks | Financial tasks view | View upcoming financial obligations | Orphan | `app/(dashboard)/dashboard/tasks/financial/page.tsx`, migration `079` | Route built but sub-nav does not link it |
| Money | Accounts | Create/edit/deactivate account, view detail | Ready | `modules/moneyflow/actions/create-account.action.ts`, `update-account.action.ts`, `deactivate-account.action.ts`, `app/(dashboard)/dashboard/money/accounts/[accountId]/page.tsx` | Idempotency migration `053` |
| Money | Transactions | Create/edit/delete income & expense | Ready | `modules/moneyflow/actions/create-transaction.action.ts`, `update-transaction.action.ts`, `delete-transaction.action.ts` | Usage-limit gated |
| Money | Transfers | Account→account internal transfer | Ready | `modules/moneyflow/actions/create-transfer.action.ts`, migration `067` | Single `type=transfer` row |
| Money | Planned/draft confirm | Post a draft (incl. from document) into balance | Ready | `modules/moneyflow/actions/post-planned-transaction.action.ts`, `confirm-document-transaction.action.ts`, `components/planned-transactions.tsx` | |
| Money | Categorization | Categorize / recategorize transaction | Ready | `modules/moneyflow/actions/categorize-transaction.action.ts`, `recategorize-expense.action.ts`, migration `057` | Rule-first |
| Money | Category rules | Create/manage auto-categorization rules | Ready | `modules/moneyflow/actions/create-category-rule.action.ts`, `manage-category-rule.action.ts`, `app/(dashboard)/dashboard/money/rules/page.tsx`, migration `070` | Reachable via Money page link |
| Money | AI suggestions | Accept/reject AI category suggestion | Ready | `modules/moneyflow/actions/review-ai-suggestion.action.ts`, migration `069` | |
| Money | Uncategorized queue | Filter & clear uncategorized tx | Ready | `queries/get-uncategorized-transactions.ts`, money page `filter=uncategorized` | |
| Money | Expense question (AI) | Ask a natural-language question about spend | Ready | `modules/moneyflow/actions/answer-expense-question.action.ts` | AI-metered |
| Money | Month history | Navigate monthly ledger + breakdown | Ready | `components/month-navigator.tsx`, `lib/month-range.ts` | |
| Money | Diagnostics | Pipeline health card | Admin-only | money page `admin && diagnostics` | Owner/admin only |
| Documents | Create note/doc | Create document (note/contract/report) | Ready | `modules/documents/actions/create-document.action.ts`, `app/(dashboard)/dashboard/documents/new/page.tsx` | Usage-limit gated |
| Documents | Upload files | Attach files (with storage limit) | Ready | `app/api/documents/upload/route.ts`, `actions/add-document-attachment.action.ts` | storage_mb limit |
| Documents | Publish / archive | Publish or archive a document | Ready | `actions/publish-document.action.ts`, status filter on list | |
| Documents | Delete | Soft-delete document | Ready | `actions/delete-document.action.ts`, migrations `045/046` | Permission-gated |
| Documents | AI extraction (OCR) | Auto-extract financial doc → draft tx | Ready | `services/document-extraction-service.ts`, `components/document-extraction-review.tsx`, migration `052` | Anthropic vision |
| Documents | Retry extraction | Retry a failed extraction | Ready | `actions/retry-document-extraction.action.ts` | |
| Documents | Comments / links | Comment, add external link | Ready | `actions/add-document-comment.action.ts`, `add-document-link.action.ts` | |
| Documents | Obligation suggestion | Turn extracted doc into a financial task | Partial | `components/document-obligation-suggestion.tsx`, migration `079` | Depends on financial-task view (orphan) |
| Subscriptions | Create/edit/delete | Manage recurring subscriptions | Ready | `modules/subtracker/actions/*` | Usage-limit gated |
| Subscriptions | Renew | Renew subscription | Ready | `actions/renew-subscription.action.ts` | |
| Subscriptions | Payment workflow | Cycles, mark-as-paid, skip, due-date change | Ready | `components/subscription-payment-workflow-panel.tsx`, `services/mark-subscription-payment-as-paid.ts`, migration `078` | On subscription detail page |
| Subscriptions | Attach document | Attach a doc on create | Ready | `app/api/subscriptions/[subscriptionId]/document/route.ts` | doc_type=other, money-safe |
| Subscriptions | Upcoming renewals | See renewal alerts | Ready | `queries/get-upcoming-renewals.ts`, dashboard + bell | |
| Action Center | Feed + execute | Execute/snooze/dismiss/resolve/assign action items | Partial | `modules/action-center/components/action-center-page.tsx`, `actions/*`, migration `048` | Not in sidebar; via bell only |
| Relations | Link entities | Manually link Task/Money/Doc/Subscription | Ready | `modules/relations/actions/create-relation.action.ts`, `components/universal-relation-viewer.tsx`, migration `047` | On all 4 detail pages |
| Relations | Unlink | Delete a relation | Ready | `modules/relations/actions/delete-relation.action.ts` | Permission-gated |
| Relations | Search candidates | Search entities to link | Ready | `modules/relations/actions/search-relation-candidates.action.ts` | |
| AI | Insights | Generate business insights (Claude) | Ready | `modules/ai/actions/generate-insights.action.ts`, `app/(dashboard)/dashboard/ai/page.tsx` | AI-metered |
| AI | Recommendations | Generate + dismiss recommendations | Ready | `actions/generate-recommendations.action.ts`, `dismiss-recommendation.action.ts` | AI-metered |
| AI | Summary | Generate summary | Internal | `actions/generate-summary.action.ts` | No dedicated UI trigger found |
| Settings | Profile + avatar | Update profile, upload/remove avatar | Ready | `modules/settings/actions/update-profile.ts`, `update-avatar.ts`, migration `066` | |
| Settings | Notifications prefs | Configure alerts + enable web push | Ready | `app/(dashboard)/dashboard/settings/notifications/page.tsx`, migration `073` | VAPID web push |
| Settings | Workspace | Edit org defaults (base currency etc.) | Admin-only | `actions/update-workspace.ts`, migration `049/065` | |
| Settings | Members | Invite / remove / change role | Admin-only | `actions/invite-member.ts`, `remove-member.ts`, `update-member-role.ts` | Seat-limit gated |
| Settings | Billing overview | Review plan, usage, invoices | Admin-only | `app/(dashboard)/dashboard/settings/billing/page.tsx` | Read-only |
| Settings | Plans | Compare plans | Partial | `app/(dashboard)/dashboard/settings/plans/page.tsx` | Upgrade buttons disabled |
| Settings | Developer | API keys / webhooks foundation | Admin-only | `app/(dashboard)/dashboard/settings/developer/page.tsx`, migration `071` | "Foundations" per copy |
| Members/Org | Switch organization | Switch between orgs | Ready | `modules/members/actions/switch-organization.action.ts`, `OrganizationSwitcher` in layout | Multi-org |
| Members/Org | Invite links | Create + accept/decline invite link | Ready | `actions/create-invite-link.action.ts`, `accept-invite-link.action.ts`, `app/invite/[token]/page.tsx`, migration `068` | |
| Onboarding | Create organization | New user creates org | Ready | `features/onboarding/actions/create-organization.action.ts`, `app/(onboarding)/onboarding/page.tsx` | |
| Auth | Login/Register/Logout | Standard auth | Ready | `features/auth/actions/*`, `app/(auth)/*` | Supabase auth |
| CRM | Clients/Deals/Activities | Full CRM CRUD + pipeline | Orphan | `modules/crm/actions/*`, `app/(dashboard)/dashboard/crm/page.tsx` | Built, not in navigation |
| Capture Inbox | Capture → suggestion | Capture text → AI suggestion → accept/edit/reject | Orphan | `modules/planner/*`, `app/(dashboard)/dashboard/inbox/page.tsx`, migration `080` | Built, not in navigation |
| Booking | Public booking | Client books via public page | Partial | `app/booking/[organizationSlug]/*`, `app/api/public/booking/*` | Internal dashboard hidden |

---

## 3. Module-by-Module Detail

### Dashboard
**Ready:** `/dashboard` aggregates `getTaskSummary`, `getMoneySummary`,
`getSubSummary`, `getUpcomingRenewals`, recent transactions. Renewal alert card
links to Subscriptions. Purely read-only overview.
Evidence: `app/(dashboard)/dashboard/page.tsx`.

### Tasks
**Ready:** Create (with project/due-date/priority), edit, inline update, delete
(soft), 3-state status, assign to member, due-date change with history,
comments, activity feed, smart sort, and a Projects sub-view (create / edit /
archive / assign task to project). Tasks list + Projects reachable via the Tasks
sub-nav (`features/todos/components/tasks-subnav.tsx`).
DB: `todos`, `task_assignees`, `task_due_date_changes`, `projects`.
Permissions: usage-limit checked on create; `data.delete` on delete.
Evidence: `app/(dashboard)/dashboard/tasks/page.tsx`, `modules/tasks/actions/*`,
`features/todos/actions/*`.

**Partial / Orphan:** Financial Tasks smart view
(`app/(dashboard)/dashboard/tasks/financial/page.tsx`) is fully implemented
(open obligations, totals by currency) but the Tasks sub-nav only exposes "All
Tasks" and "Projects", so users cannot reach it through the UI.

### Money / Finance
**Ready:** Accounts (create/edit/deactivate + detail page), transactions
(create/edit/delete), internal transfers, planned/draft posting (including
drafts created from document extraction), rule-first categorization,
category-rule management (`/dashboard/money/rules`), AI category suggestions
(accept/reject), an uncategorized queue filter, monthly history navigation,
expense breakdown, category-intelligence cards, and an AI expense Q&A box.
Admin-only categorization diagnostics.
DB: `money_transactions`, `money_accounts`, `money_categories`,
`money_category_rules`, `money_ai_suggestions`, `exchange_rates`.
Migrations: `049/050/051/052/053/057/062/063/067/069/070`.
Evidence: `app/(dashboard)/dashboard/money/page.tsx`, `modules/moneyflow/*`.

### Documents
**Ready:** Create note/contract/report, file upload with storage-limit
enforcement, publish/archive, soft-delete, comments, external links, and — for
financial document types — automatic AI extraction (Anthropic vision OCR) with a
review UI that can confirm the extracted data into a money draft transaction.
Retry on failed extraction. Status-filtered document list + detail page with
relation viewer.
DB: `documents`, `document_attachments`, `document_extractions`.
Migrations: `045/046/051/052`.
Evidence: `app/(dashboard)/dashboard/documents/*`, `modules/documents/*`,
`app/api/documents/upload/route.ts`.

**Partial:** The obligation-suggestion card (extracted doc → financial task)
depends on the financial-task view, which is itself an orphan route.

### Subscriptions
**Ready:** Create/edit/delete/renew subscriptions; upcoming-renewal alerts; and a
real payment workflow on the subscription detail page — planned payment cycles,
mark-as-paid (posts an expense via an atomic RPC with cycle-level idempotency),
skip cycle, and change payment due-date. Documents can be attached on create in
a money-safe way (no extraction, never touches Money).
DB: `subscriptions`, `subscription_payment_cycles`, payment tasks.
Migrations: `067(context)`, `078`.
Evidence: `app/(dashboard)/dashboard/subscriptions/*`, `modules/subtracker/*`.

### Action Center
**Partial (built, weakly reachable):** Full feed with source/type filters, a
summary strip, a detail drawer, and item operations: execute (e.g. materialize a
todo), snooze, dismiss, resolve, assign, refresh. Items are generated from
module signals (documents, etc.) and priority-scored.
DB: `action_items`, `action_item_events`, `action_item_links`. Migration `048`.
**Gap:** No sidebar entry. Reachable only as the notification-bell fallback
target (`shared/ui/notifications.tsx:112` → `ROUTES.actions`).
Evidence: `app/(dashboard)/dashboard/actions/page.tsx`,
`modules/action-center/*`.

### Relations (Cross-module)
**Ready:** A universal relation viewer is embedded on all four entity detail
pages (Task, Money transaction, Document, Subscription). Users can manually
create relations (with entity search + relation-type select) and delete them,
subject to `entity_link.create` / `entity_link.delete` permissions. The
automation engine also creates relations automatically (e.g. a document created
"from" an entity is auto-linked `generated_from`).
DB: `entity_links` (relations built on this table, not a separate table).
Migration `047`.
Evidence: `modules/relations/*`, detail pages, `lib/entity-links/*`,
`modules/automation/handlers/on-document-created.ts`.

### AI Suggestions / Assistant
**Ready:** `/dashboard/ai` generates Claude-powered Insights and Recommendations
on demand and lets the user dismiss recommendations. Money AI category
suggestions and the expense Q&A are additional user-facing AI surfaces. All AI
calls are metered against the `ai_calls` monthly limit via `ai_requests`.
**Internal:** `generate-summary.action.ts` has no dedicated UI trigger.
Evidence: `app/(dashboard)/dashboard/ai/page.tsx`, `modules/ai/*`,
`lib/ai/*`.

### Billing / Usage Limits
**Ready (enforcement):** `checkPlanLimit()` gates create operations across Tasks,
Money, Subscriptions, Documents, CRM, AI, Members. Counting metrics use live
`COUNT`, storage sums attachment sizes, AI uses a monthly request ledger. An
atomic Postgres RPC `reserve_organization_usage` (migration `072`) provides
race-safe reservations, and RLS `is_organization_writable` blocks writes after
trial end. A trial banner is shown to non-unlimited accounts.
**Partial:** Plans page renders comparison, but all upgrade buttons are disabled
("Upgrade coming soon") — no checkout/payment integration.
Evidence: `lib/billing/*`, `modules/billing/*`, `app/(dashboard)/dashboard/settings/{billing,plans}/page.tsx`.

### Settings
**Ready:** Profile (+ avatar upload/remove), Notifications (preferences + web
push), Workspace (admin), Members (admin — invite/remove/role), Billing overview
(admin, read-only), Plans (comparison), Developer (admin — API keys/webhooks
foundation). Sidebar filters admin-only items by role.
Migrations: `065/066/073`.
Evidence: `app/(dashboard)/dashboard/settings/*`, `modules/settings/*`.

### Members / Organization / Workspace
**Ready:** Multi-organization support with an organization switcher in the header,
invite-by-link (create link + public accept page at `/invite/[token]`), accept /
decline invites, remove member, change role, switch active org. Seat counting
treats active + invited as occupying a plan seat.
DB: `memberships`, `organizations`, `workspaces`, pending invites. Migrations
`068/076`.
Evidence: `modules/members/*`, `modules/settings/actions/*`,
`app/invite/[token]/page.tsx`.

### CRM (Orphan)
Complete CRM: clients, contacts, deals with pipeline stages, activities, notes;
create/update/delete clients, create deals, change deal stage, close/win/lose
deals, log activities. Analytics reads CRM metrics (revenue won, win rate). But
`/dashboard/crm` is **not linked anywhere in navigation**.
Evidence: `modules/crm/*`, `app/(dashboard)/dashboard/crm/page.tsx`.

### Capture Inbox / Planner (Orphan)
Thin capture layer: capture text → AI suggestion → accept / edit / reject →
routes into existing services (money-safe). Fully built UI (capture input, inbox
tabs, entry list, suggestion review). `/dashboard/inbox` is **not linked in
navigation**.
Migration `080`.
Evidence: `modules/planner/*`, `app/(dashboard)/dashboard/inbox/page.tsx`.

### Booking (Hidden internal + live public)
Full booking system: hosts, services, availability rules, requests, public
booking pages, and a public API. The **internal** dashboard pages
(`/dashboard/booking/*`) are built but the sidebar entry is commented out. The
**public** pages (`/booking/[org]/[host]`) and API (`/api/public/booking/*`)
remain reachable.
Evidence: `modules/booking/*`, `app/booking/*`, `app/api/public/booking/*`,
`shared/ui/sidebar.tsx:54` (commented out).

### Notifications / Cron / Background jobs
**Ready:** Notification bell (overdue tasks, renewals, booking requests),
reminder scheduling, web-push delivery, deduplication, unread counters, per-user
preferences. Four cron jobs run on Vercel schedule, all fail-closed behind
`CRON_SECRET`:
- `extraction-sweep` (*/10 min) — recover stuck document extractions.
- `reminders` (*/5 min) — process due reminders.
- `subscription-sweep` (03:30 daily) — repair missing subscription cycles/tasks.
- `suggestions-sweep` (03:00 daily) — expire stale money AI suggestions.
Migrations `073/074/075/082/083/084/085`.
Evidence: `app/api/cron/*`, `vercel.json`, `modules/notifications/*`.

---

## 4. End-to-End User Workflows Already Supported

### Workflow: Document upload → AI extraction → Money draft → confirm
1. User creates a financial document and uploads a file
   (`app/(dashboard)/dashboard/documents/new`, `api/documents/upload`).
2. Extraction runs (fast path + `extraction-sweep` cron safety net) —
   `modules/documents/services/document-extraction-service.ts`.
3. On the document detail page the extraction review UI shows the normalized
   data (`components/document-extraction-review.tsx`).
4. User confirms → a Money **draft/planned** transaction is created
   (`confirm-document-transaction.action.ts`).
5. On the Money page the draft appears under "Planned"; user posts it into the
   balance (`post-planned-transaction.action.ts`).
6. Document and transaction are linkable via the relation viewer.
Evidence: documents + moneyflow modules, migration `052`.

### Workflow: Task lifecycle
1. User creates a task with due date/project (`create-todo.action.ts`, limit-checked).
2. User assigns it, changes status (todo → in-progress → done), extends the
   deadline (tracked in history), comments.
3. Activity feed reflects each change.
Evidence: `modules/tasks/*`, migrations `055/056/064`.

### Workflow: Subscription payment
1. User creates a subscription; planned payment cycles are generated
   (`create-subscription-payment-cycle.ts`).
2. On the subscription detail page the payment workflow panel lists cycles.
3. User marks a cycle **paid** → an expense is posted via an atomic RPC with
   cycle-level idempotency (`mark-subscription-payment-as-paid.ts`), or skips it,
   or changes the due date.
4. `subscription-sweep` cron repairs any missing cycles daily.
Evidence: `modules/subtracker/*`, migration `078`.

### Workflow: Manual relation linking
1. User opens any Task / Money / Document / Subscription detail page.
2. Uses the relation viewer to search and link a related entity, or unlink one.
3. The relation is visible on both entities' detail pages.
Evidence: `modules/relations/*`, all four `[id]/page.tsx` pages.

### Workflow: AI insights & recommendations
1. On `/dashboard/ai` the user clicks "Insights" / "Recommendations".
2. Claude generates results (metered against `ai_calls`).
3. User reads insights and dismisses recommendations they don't want.
Evidence: `modules/ai/*`.

### Workflow: Billing limit enforcement
1. User attempts to create a task/tx/doc/subscription/member.
2. `checkPlanLimit()` / `reserve_organization_usage` verifies quota; over-limit
   returns a friendly "Plan limit reached / Upgrade" reason and the create is
   blocked.
3. After trial end, RLS `is_organization_writable` blocks writes and the trial
   banner prompts a plan choice.
Evidence: `lib/billing/check-limit.ts`, migration `072`.

### Workflow: Member / organization management
1. Admin invites a member (seat-limit checked) via link or email
   (`create-invite-link.action.ts` / `invite-member.ts`).
2. Invitee accepts at `/invite/[token]`.
3. Admin can change role or remove; users switch active org via the header
   switcher.
Evidence: `modules/members/*`, `modules/settings/actions/*`.

---

## 5. Automation Inventory

| Trigger | Event / Source | System Action | User-visible Result | Status | Evidence |
| ------- | -------------- | ------------- | ------------------- | ------ | -------- |
| `document.created` (with linked entity) | Domain event → automation registry | Auto-create `generated_from` entity_link + audit log | Related entity appears in relation viewer | Ready | `modules/automation/handlers/on-document-created.ts` |
| `task.created` | Domain event | Registered handler runs | (Handler-defined) | Partial | `handlers/on-task-created.ts` |
| `money.transaction.created` | Domain event | Registered handler runs | Categorization side-effects | Partial | `handlers/on-transaction-created.ts` |
| `subscription.renewed` | Domain event | Registered handler runs | Renewal follow-up | Partial | `handlers/on-subscription-renewed.ts` |
| Document upload | Fast path + `extraction-sweep` cron */10 | Anthropic OCR extraction | Extraction review UI on doc page | Ready | `services/document-extraction-service.ts`, `api/cron/extraction-sweep` |
| Time (*/5 min) | `reminders` cron | Deliver due reminders (push/bell) | Notification appears | Ready | `api/cron/reminders`, `modules/notifications/reminders` |
| Time (03:30 daily) | `subscription-sweep` cron | Repair missing payment cycles/tasks | Cycles appear on subscription page | Ready | `api/cron/subscription-sweep`, migration `078` |
| Time (03:00 daily) | `suggestions-sweep` cron | Expire stale money AI suggestions | Stale suggestions disappear | Ready | `api/cron/suggestions-sweep`, migration `069` |
| Document extraction | Signal | Create Action Center item for document | Item in Action Center feed | Partial | `services/create-action-item-for-document.ts` |
| Money categorization | Rule-first engine | Auto-assign category / raise AI suggestion | Category set / suggestion shown | Ready | `services/money-categorization.service.ts`, migration `069` |

> Note: the domain-event **vocabulary** (`lib/events/domain-event-names.ts`) is
> far larger than the four registered handlers. Many event names are emitted for
> audit/logging but have no automation handler yet.

---

## 6. Database-backed Capabilities

| DB Object | Purpose | Used By | User-facing? | Evidence |
| --------- | ------- | ------- | ------------ | -------- |
| `entity_links` | Cross-module relations | Relations module, automation | Yes | migration `047` |
| `action_items` (+ `_events`, `_links`) | Action Center orchestration | Action Center | Indirect (bell) | migration `048` |
| `money_transactions` / `money_accounts` / `money_categories` | Finance core | Money module | Yes | migrations `051–067` |
| `money_category_rules` | Auto-categorization | Money rules page | Yes | migration `070` |
| `money_ai_suggestions` | AI category suggestions | Money uncategorized queue | Yes | migration `069` |
| `document_extractions` | AI OCR output | Document detail | Yes | migration `052` |
| `subscription_payment_cycles` | Payment workflow | Subscription detail | Yes | migration `078` |
| `task_due_date_changes` | Deadline history | Task detail | Yes | migration `064` |
| `projects` / `task_assignees` | Projects & assignment | Tasks | Yes | migrations `056/060` |
| `organization_usage_counters` + `reserve_organization_usage` RPC | Atomic usage reservation | Billing enforcement | Indirect | migration `072` |
| `is_organization_writable` RPC | Trial write-lock (RLS) | check-limit + RLS | Indirect | migration `027`/`072` |
| `billing_subscriptions` / `plans` | Plan state & limits | Billing/limits | Yes | migration `071` |
| `developer_api_keys` / `developer_webhooks` | Developer foundation | Developer settings | Yes (admin) | migration `071` |
| `planner_entries` / `planner_suggestions` | Capture Inbox | Inbox (orphan) | Partial | migration `080` |
| `reminder_schedules` + attention counters | Notifications/reminders | Bell, cron | Yes | migrations `075/082–085` |
| `exchange_rates` + org base currency | Cross-currency totals | Money summaries | Yes | migrations `049/050` |

---

## 7. Permissions and Access Control

**Roles (system, lowercase in DB):** `owner`, `admin`, `manager`, `member`.
Account-level roles: `user`, `developer`, `admin`, `owner`
(`lib/billing/account-limits.ts`).

**Permission model:** a per-request `CurrentContext` carries a
`ReadonlySet<string>` of permissions. Checks use `canDo(ctx, "todos.write")`,
`isAdmin(ctx)`, `isOwner(ctx)` (`lib/context/current-context.ts`). Settings pages
use `hasSettingsPermission(ctx, "...")`.

**Admin/owner-gated actions:** Workspace edit, Members management, Billing
overview, Developer settings (`developer.view`), Money diagnostics card. Settings
sub-nav filters admin-only items (`SettingsSidebar.canAdminister`).

**Permission gates seen in UI:** `data.write` / `data.delete` (money & document
delete buttons, extraction confirm), `entity_link.create` / `entity_link.delete`
(relation viewer), per-page `SettingsAccessDenied` fallbacks.

**Backend / RLS:** Organization isolation and soft-delete enforced at the DB via
RLS (migrations `045/046` documents; `076/077` integrity hardening). Write access
is additionally gated by `is_organization_writable` after trial end.
`account_role` / `unlimited_access` grant developer unlimited access (migration
`059`).

**Auth boundary:** `proxy.ts` + `shared/config/routes.ts` define public routes
(`/`, `/login`, `/register`, `/api/health`) and public prefixes (`/booking/`,
`/api/public/`, `/invite/`); everything else requires a session, and org-less
users are funneled to onboarding.

---

## 8. Billing and Limits

**Plans:** `trial`, `start`, `pro`, `business` (canonical) + legacy `free`,
`enterprise` (`modules/billing/constants/billing.constants.ts`).

**Usage metrics enforced:** members, workspaces, tasks, deals, clients,
documents, subscriptions, money_transactions, ai_calls, storage_mb. `-1` =
unlimited.

**Counters:** counting metrics use live `COUNT` (soft-delete aware); storage sums
`document_attachments.file_size`; AI uses a monthly `ai_requests` ledger.

**Atomic enforcement:** `reserve_organization_usage` RPC provides race-safe
reservation against `organization_usage_counters`; `release_organization_usage`
reverses it (`modules/billing/services/billing-service.ts`, migration `072`).

**On limit exceeded:** create actions return `{ allowed: false, reason: "Plan
limit reached: used/limit … Upgrade your plan" }` and the mutation is blocked.
Canceled subscription and post-trial state block writes entirely.

**What the user sees:** a trial banner (non-unlimited accounts), a developer-
access badge (unlimited accounts), Billing overview (plan, usage, invoices), and
a Plans comparison. **Gap:** upgrade/checkout is disabled ("Upgrade coming
soon") — there is no self-serve payment path.

---

## 9. Features That Exist Technically But Are Not Fully User-Ready

| Area | What Exists | Why Not Ready | Needed To Become User-ready | Evidence |
| ---- | ----------- | ------------- | --------------------------- | -------- |
| Action Center | Full feed, filters, execute/snooze/dismiss/resolve/assign | No sidebar entry; only bell fallback | Add nav item + entry points | `app/(dashboard)/dashboard/actions/page.tsx`, `sidebar.tsx` |
| CRM | Complete CRM CRUD + pipeline | Not linked in navigation | Add nav item | `modules/crm/*`, `app/(dashboard)/dashboard/crm/page.tsx` |
| Capture Inbox | Capture → AI suggestion → accept/edit/reject | Not linked in navigation | Add nav item | `modules/planner/*`, `.../inbox/page.tsx` |
| Financial Tasks | Smart obligations view | Tasks sub-nav has no link to it | Add "Financial" tab to sub-nav | `.../tasks/financial/page.tsx`, `tasks-subnav.tsx` |
| Booking (internal) | Hosts/services/availability/requests dashboards | Sidebar entry commented out | Re-enable sidebar item | `sidebar.tsx:54`, `modules/booking/*` |
| Plan upgrade | Plan comparison UI | Upgrade buttons disabled; no checkout | Payment integration | `.../settings/plans/page.tsx`, `BillingOverview.tsx` |
| Developer API/webhooks | API key + webhook tables & settings UI | Described as "foundations" | Real API key issuance + webhook delivery | `modules/developer/*`, migration `071` |
| Analytics reports | create-report / snapshot / update-widget actions | No UI to invoke them | Build report builder UI | `modules/analytics/actions/*` |
| AI summary | `generate-summary.action.ts` | No UI trigger | Add UI entry point | `modules/ai/actions/generate-summary.action.ts` |
| Automation handlers | Large event vocabulary | Only 4 handlers registered | Register more handlers | `automation-registry.ts`, `domain-event-names.ts` |
| Financial obligations events | Event names + doc obligation suggestion | Depends on orphan financial-task view | Link financial-task view | migration `079` |

---

## 10. Gaps / Unknowns / Risks

- **Navigation is the biggest gap, not functionality.** Several complete
  subsystems (Action Center, CRM, Capture Inbox, Financial Tasks, internal
  Booking) are built and working but unreachable from the sidebar/sub-nav. This
  understates the product's real capability and risks these features going
  untested by users.
- **No self-serve billing.** Enforcement is real and strict, but there is no way
  for a user to actually upgrade/pay — a launch blocker for monetization.
- **Automation breadth vs depth.** The domain-event vocabulary is very broad but
  only four handlers are registered; many emitted events are audit-only. Users
  may expect automations that don't exist yet.
- **Automation visibility.** Auto-created relations and Action Center items
  happen server-side; without an obvious surface, users may not notice them.
- **Cron dependency.** Extraction recovery, reminders, subscription repair, and
  suggestion expiry all rely on `CRON_SECRET` being configured; they fail-closed
  (safe) but silently do nothing if misconfigured.
- **AI summary / analytics reports** have server actions but no UI — backend
  ahead of frontend.
- **Testing:** meaningful test coverage exists (action-center, billing limits,
  notifications, relations, money delete) but the orphaned routes and payment
  path warrant end-to-end QA before public release.

---

## 11. Final Product Capability Map

### The user already can:
- Run a cross-module dashboard overview.
- Manage tasks end-to-end (create, assign, status, deadlines + history,
  comments, projects, smart sort).
- Run finances: accounts, income/expense, internal transfers, categories, auto-
  categorization rules, AI suggestions, drafts, monthly analytics, expense Q&A.
- Create documents, upload files, and get AI (OCR) extraction of financial docs
  that can be confirmed into money transactions.
- Track subscriptions and run a full payment workflow (cycles, mark-as-paid,
  skip, due-date change).
- Manually link and unlink related entities across all four core modules.
- Generate and act on AI insights & recommendations.
- Manage profile, notifications (incl. web push), workspace, members, and view
  billing/plans.
- Belong to multiple organizations and invite teammates via link.

### The system already automates:
- AI OCR extraction of financial documents (fast path + cron recovery).
- Rule-first money categorization + AI category suggestions.
- Auto-creation of entity relations from originating entities.
- Subscription payment-cycle generation and daily repair.
- Reminder delivery (bell + web push) and stale-suggestion expiry.
- Usage counting + atomic quota reservation + post-trial write-lock.

### The administrator already can:
- Manage members (invite/remove/role) with seat-limit enforcement.
- Edit workspace/org defaults (incl. base reporting currency).
- Review billing, usage, and invoices.
- Access developer settings (API key / webhook foundations).
- See money-pipeline diagnostics.

### Built inside the project but not yet a shipped user feature:
- Action Center (unlinked from nav).
- CRM (unlinked from nav).
- Capture Inbox / Planner (unlinked from nav).
- Financial Tasks view (unlinked from sub-nav).
- Internal Booking dashboards (sidebar entry disabled).
- Self-serve plan upgrade / checkout (buttons disabled).
- Analytics report builder & AI summary (server actions without UI).

---

## Appendix — Method & Coverage

- **Dashboard routes reviewed:** all 35 `page.tsx` under `app/(dashboard)`
  (verified via route enumeration).
- **Navigation reviewed:** `shared/ui/sidebar.tsx`, `SettingsSidebar.tsx`,
  `tasks-subnav.tsx`, `shared/ui/notifications.tsx`, `shared/config/routes.ts`.
- **Server actions reviewed:** ~110 `use server` files enumerated across
  `modules/`, `features/`, `lib/`.
- **Migrations reviewed:** `045`–`085` (automation, relations, billing, AI,
  usage limits, payment cycles, financial tasks, capture inbox).
- **Cron reviewed:** all 4 routes + `vercel.json`.
- **Billing/permissions reviewed:** `lib/billing/*`, `lib/context/*`,
  `lib/auth/*`.

Every feature listed under Ready/Partial/Orphan/Admin-only cites a concrete file.
