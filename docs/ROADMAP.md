# Roadmap — Nevora Business OS

> Current source-of-truth roadmap for the repository. Status reflects the tree on
> **2026-07-08 (Phases A–D committed)**: migrations are present through
> `097_phase_c_documents_money_subscriptions_integration.sql` (**baseline
> `000`–`098`, next free `099`** — `000`–`097` applied on remote, `098` written
> but **not yet applied**), local `typecheck`
> passes after `next typegen`, and the product focus is the **AI-assisted
> operating desk, Action Center first** — not CRM or Booking expansion.
>
> Earlier internal notes numbered phases differently (e.g. "Phase 2 — relations",
> "Phase 3 — Action Center"). Those map onto the phases below; this document keeps
> the stabilized execution order.
>
> **Superseded statements elsewhere.** Any doc claiming the migration head is
> `067`, `077`, `079`, `086`, or `093`, or that CRM/Booking are merely "hidden from
> the sidebar", is stale. Canonical: [`OPERATIONS_MANUAL.md`](./OPERATIONS_MANUAL.md),
> [`release/release-checklist.md`](./release/release-checklist.md),
> [`MODULE_STATUS.md`](./MODULE_STATUS.md).
>
> **Known truthfulness gaps (open, tracked as release blockers).** Do not read this
> document as claiming these are done:
> - Stripe: the adapter and webhook code exist and `billing-provider.ts` resolves
>   them, but no `STRIPE_*` runtime configuration is present. Paid self-serve
>   checkout is **not operational**. Billing mode is not yet explicitly declared.
> - Phase D: `featureGateService` and `usageService` have **zero external call
>   sites** — the live enforcement path is still `checkPlanLimit` from `lib/billing`.
>   The entitlement keys seeded by `096` are not gated in active product flows.
> - Booking: routes are closed, but at the database layer `anon` can still read
>   published booking data **and** EXECUTE the `SECURITY DEFINER` RPC
>   `create_booking_request_public` (an anonymous write path). `098` fixes both;
>   it is written and locally verified but **not yet applied to remote**.
> - Pricing: `modules/landing` and `modules/billing/plan-catalog.ts` are separate
>   sources of truth and disagree on currency and limits.

## Phase 0 — Stabilization & Source of Truth — *mostly done / keep synced*

Bring README, architecture, module status, roadmap, product copy, security and
CI into one consistent, honest state. No new business features.
- `docs/` source of truth (this set of files) created.
- README synced with the real project state.
- `typecheck` npm script added; lint / typecheck / build verified green.
- CI already runs install → typegen → typecheck → lint → test → build.
- Migration baseline is **`000` → `098` in the tree, next free `099`**; remote is
  applied through `097` (`054` is a known, intentional gap). Do not describe `067`,
  `077`, `079`, `086`, or `093` as the repository head. Verify against the tree,
  not a doc: `ls supabase/migrations | tail -1`. And verify *remote* by probing an
  object the migration creates — never by trusting this line.

Open follow-ups:
- Keep release docs aligned with the latest migration head when a new migration
  lands.
- Replace placeholder landing contact channels before public launch.

## Phase A — Product Focus & Release Closure — *done (2026-07-08)*

Lock the active product scope and close release blockers before public release.
No new product features.

- **Action Center is the primary screen.** `/dashboard` now renders the Action
  Center; the metrics roll-up moved to `/dashboard/overview`; `/dashboard/actions`
  307s to `/dashboard` for old bookmarks and persisted `notifications.target_url`.
- **Paused modules hard-gated at three surfaces.** CRM and Booking pages, all 19
  Server Actions, and all 7 booking route handlers now reject server-side. The
  public `/booking/*` surface 404s too. Hiding a nav link was never a gate: a
  `"use server"` export stays reachable over POST even when its page 404s.
- **Product copy already matched** the active scope (Phase-8 landing alignment);
  Phase A added tests so it cannot drift back.
- **Invariants encoded as tests** — `test/release-invariants.test.ts` and
  `shared/config/paused-modules.coverage.test.ts` assert confirm-first finance,
  mark-as-paid idempotency, "read is not resolved", and paused-module coverage by
  scanning the source tree.
- **Release documentation** — `OPERATIONS_MANUAL.md`, `contracts/`,
  8 `runbooks/`, and canonical `release/{release-checklist,smoke-test-checklist,rollback-plan}.md`.
- **No schema change in Phase A itself** (the baseline was `000`–`093` at the time).
  Phases B–D later added `094`–`097`; the current baseline is `000`–`097`.

Remaining (not blockers):
- Restructure the Action Center feed sections around Requires Confirmation /
  Due Soon / Overdue / Money Attention / Inbox. Today's sections (Due Soon /
  Waiting for Action / Missing Information / AI Suggestions / Recently Resolved)
  cover the same signals under different names.
- Move `syncActionItems()` generation fully to cron (it runs best-effort on load).

## Phase 1 — Core Foundation — *done*

Auth, organizations, workspaces, session context (`requireUser`/`requireOrg`),
`proxy.ts` gating, onboarding, invites. This is the platform's core and is
MVP Ready.

## Phase 2 — Security Layer — *done / ongoing hardening*

RLS on business tables, `WITH CHECK` policies, SECURITY DEFINER RPC with pinned
`search_path` + explicit grants (`035`, `037`), Postgres-backed rate limiting
(`036`/`038`), cron auth (`CRON_SECRET`, fail-closed). Ongoing: keep every new
table compliant (see `SECURITY.md`).

## Phase 3 — Tasks / Money / Documents / Subscriptions Stabilization — *in progress*

Stabilize the four priority business modules. Tasks, Money and Documents are
MVP-ready inside the current scope; Subscriptions has moved beyond the original
partial state and now has payment-cycle workflow primitives, but still needs
end-to-end QA on real data.

Current additions beyond the 2026-06-30 roadmap:
- Money intelligence (`069`) and category-rule governance (`070`) are present.
- Subscription payment cycles (`078`) add planned/task-open/paid/skipped/cancelled
  lifecycle around recurring payments.
- Financial task context (`079`) extends `todos` so invoice/payment/domain/tax
  obligations can be represented as actionable tasks without introducing a
  parallel obligations table.

Remaining:
- Manual QA: task/project create/update/status/due-date/financial-task flows.
- Manual QA: transfer neutrality, planned transaction posting and analytics
  exclusion.
- Manual QA: subscription payment cycles, mark-as-paid, skip, change due date and
  cancel renewal.
- Document extraction reliability and failed-upload cleanup checks.

## Phase 4 — Cross Module Relations — *in progress*

`entity_links`-based relations (migration `047`) connecting Task ↔ Transaction ↔
Subscription ↔ Document. Module exists; needs consistent link-management UX.
Reverse navigation is in place: documents now show reverse linked entities
through `UniversalRelationViewer` — a document linked from a subscription
displays the related subscription on the document detail page.
Relations scope currently covers active modules only: Tasks, Money, Documents and
Subscriptions. CRM / Leads / Clients / Deals remain paused and out of scope.
Future relation expansion must stay limited to active modules unless a paused
module is explicitly reactivated by product decision. Relation resolver metadata
(entity kind → table / route / label) is centralized in a single
`RELATION_ENTITY_CONFIG`; verification fails closed for unsupported types.

## Phase 5 — Automation Foundation — *in progress*

Domain-event dispatch engine + handlers + logs (`040`/`042`). Plumbing is in
place with tests; no user-facing rules engine yet.

Current additions:
- Reminder scheduling and attention counters (`075`) create reminder schedules
  for tasks, subscriptions, planned payments, documents and snoozed actions.
- `subscription-sweep` cron provisions subscription payment cycles/tasks.

Remaining:
- Verify cron auth (`CRON_SECRET`) in production.
- Add integration coverage for reminder de-duplication and stale-source handling.
- Keep heavy work behind cron/async boundaries so user actions stay fast.

## Phase 6 — Action Center — *in progress*

Orchestration layer (`/dashboard/actions`, migration `048`) normalizing module
signals into `action_items`.

Done since the original roadmap:
- Action Center is in the primary sidebar.
- Document extraction creates review/confirm actions.
- Reminder processing can surface tasks/subscriptions/payments/documents as
  action items and notification counters.

Open follow-ups:
- Show top pending actions on `/dashboard`.
- Expand subscription/payment cycle signals into richer action types.
- Add DB/integration tests for action/reminder idempotency.

## Phase 7 — Documents Automation — *partially started*

Document-to-Transaction pipeline (migrations `051`/`052`): receipt/invoice
upload → AI extraction → draft money transaction → Action Center confirm.
Working end-to-end; needs reliability and broader document types.

Current direction:
- Financial documents can now also suggest financial-context tasks via the `079`
  model when the correct output is an obligation/reminder rather than an
  immediate money draft.

Remaining:
- Keep the invariant: AI/document detection never posts a final money transaction.
- Complete QA for Upload → Extract → Draft/Task → Action Center → Human
  confirmation.
- Add image/OCR provider hardening and duplicate-detection UX.

## Phase 8 — Analytics Layer — *partial*

Dashboard metrics, activity timeline, per-module stats exist. Next: aggregation
and caching, richer visualizations.

## Phase 9 — AI Layer — *partial*

Insights and recommendations via Anthropic exist. Direction: scheduled
generation, more domain-event-driven sources, summaries. **AI assistance is
scoped — not an autonomous business agent.**

## Phase 10 — SaaS Monetization — *partial / provider coded, not configured*

Billing/trials and plan limits exist. Phase 6 added normalized plan/developer
access structures (`071`) and atomic usage reservations (`072`); Phase 7 added
member-seat atomicity (`076`); Phase D added the commercial-readiness schema
(`096`).

The payment provider **has been chosen and coded**: `StripeBillingAdapter`
(checkout, webhook signature verification, customer portal), resolved through
`billing-provider.ts` on `BILLING_PROVIDER`. What is missing is *runtime
configuration* — no `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` or `STRIPE_PRICE_*`
values — so self-serve checkout cannot complete. This is a configuration and
honesty gap, not a "we haven't picked a provider" gap.

Remaining:
- Declare the billing mode explicitly: **Stripe runtime-ready** *or* **private
  beta**. Do not ship the hybrid state where the UI offers checkout that cannot run.
- Activate paid plans only from trusted provider webhooks.
- Unify the public plan catalog: `modules/landing` (EUR, stale limits) and
  `modules/billing/plan-catalog.ts` (USD) currently disagree.
- Wire Phase D's `featureGateService` / `usageService` into real product flows —
  today both have zero external call sites and `checkPlanLimit` does the work.
- Retire or isolate legacy `checkPlanLimit` paths for the paused CRM keys
  (`clients`, `deals`).

## Phase 11 — Notifications, Reminders & Attention — *in progress*

The original roadmap treated notifications as part of Action Center hardening.
They are now a distinct production surface:
- notification delivery/preferences (`073`);
- browser tab indicator and read RPCs (`074`);
- reminder schedules, reminder events and counters (`075`);
- notification provider/UI and settings notification page.

Remaining:
- Production smoke test browser notification permissions, VAPID env and quiet
  hours.
- Verify tab/counter sync across multiple tabs.
- Add integration tests for due reminders and category preference filtering.

## Phase 12 — Production Hardening & Controlled Beta — *in progress*

Phase 7 audit/release docs exist and several hardening migrations are present:
- `076_phase7_member_seat_atomicity`;
- `077_phase7_data_integrity_hardening`;
- release checklist, rollback plan and beta launch plan under `docs/release/`.

Current required gates before controlled beta:
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Supabase migration/lint verification against the target environment
- manual smoke test of core flows on production-like infra

Known gaps to keep visible:
- DB/E2E harness for cross-org RLS denial and concurrent limit overshoot.
- Remote migration status must be verified through `097`.
- Payment provider adapter exists (Stripe); its **runtime configuration is absent**,
  so paid self-serve checkout is not operational.
- CRM and Booking remain out of active MVP scope. Booking's `anon` REST surface is
  still open at the database layer (P0 — see `MODULE_STATUS.md`).

---

### Parked / paused

- **CRM / Clients** — implemented, Paused per product direction. Not marketed as
  an active feature; preserved as long-term direction only.
- **Booking** — implemented, hidden from navigation, **not part of the active MVP
  scope**. Needs a product decision: resurface vs. formal pause.

### Operational follow-ups

- Replace placeholder landing contact channels (`hello@nevora.com`, `@nevora`)
  with real ones before launch.
- Verify remote migrations are applied through `097` before beta.
- Re-run the release checklist after every migration head change.

### Resolved operational follow-ups

- **Migration `064` (task due-date history) remote status — verified on
  2026-06-30** via `supabase migration list`. Migration `064` is **applied on
  remote** Supabase; all migrations through `067` are present remotely. No
  database action required.
- **Local gates after the `079` task shape — verified on 2026-07-03**:
  `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass.
