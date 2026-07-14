# Roadmap — Nevora Business OS

> Current source-of-truth roadmap for the repository. Status reflects the tree on
> **2026-07-10**: migrations are present through
> `101_fix_paddle_boundary_allows_internal.sql` (**baseline
> `000`–`101`, next free `102`** — all 101 applied on remote; `100`/`101` are the
> Paddle billing boundary, applied 2026-07-09; `054` is a known, intentional gap),
> local `typecheck`
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
> - Paddle: it is now the only paid billing provider, but the dedicated
>   checkout/webhook/portal pass is still pending. The repository default is
>   `BILLING_MODE=private_beta`, so paid self-serve checkout is intentionally
>   disabled until Paddle runtime config and smoke tests are complete.
> - Phase D: `featureGateService` and `usageService` now guard document
>   processing, AI suggestions, and storage upload boundaries; legacy
>   `checkPlanLimit` still exists in older surfaces and should be retired
>   gradually.
> - Booking: `098` (applied) closed the `anon` read + `SECURITY DEFINER` write
>   surface at the database layer, on top of the route 404s.
> - Pricing: `modules/billing/plan-catalog.ts` is the single source of truth, in
>   EUR, matching the enforced `plan_limits`. `modules/landing` renders the same
>   commercial numbers through `public-plan-view.ts`; a consistency test pins them.

## Phase 0 — Stabilization & Source of Truth — *mostly done / keep synced*

Bring README, architecture, module status, roadmap, product copy, security and
CI into one consistent, honest state. No new business features.
- `docs/` source of truth (this set of files) created.
- README synced with the real project state.
- `typecheck` npm script added; lint / typecheck / build verified green.
- CI already runs install → typegen → typecheck → lint → test → build.
- Migration baseline is **`000` → `101` in the tree, next free `102`**; all 101
  are applied on remote (`054` is a known, intentional gap). Do not describe `067`,
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
  Phases B–D later added `094`–`097`, release closure added `098`/`099`, and the
  Paddle billing boundary added `100`/`101`; the current baseline is `000`–`101`.

Remaining (not blockers):
- The daily screen now groups into **Needs your review / Money attention / Next
  actions / Recently updated** (§9). Money attention is a product decision, not a
  new data model: an item is financial when its type is payment/renewal or its
  source/primary entity is a transaction or subscription, decided per-item in
  `services/phase-b-sections.ts`. A finer split (Requires Confirmation / Overdue /
  Inbox naming) is still open if wanted.
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
- **Inbox / Action-Center split:** the Action Center is now **read-only** — it owns
  attention and routing, with six summary **filter** cards over one predicate
  contract and a compact read-only Attention list that links each item to its
  owning module (`getActionItemDestination`). All mutations (resolve / dismiss /
  snooze / assign / execute / confirm / delete) and the interactive feed + detail
  drawer were removed from its UI. Capture-derived review (planner suggestions and
  a captured document's expense draft) moved fully into the Inbox, reusing existing
  review Server Actions. Stale items auto-close via `reconcileStaleActionItems`.

Open follow-ups:
- Expand subscription/payment cycle signals into richer action types.
- Add DB/integration tests for action/reminder idempotency.
- Retire the now-unused Action Center backend actions/executors once no saved link
  or notification depends on them.

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

## Phase 10 — SaaS Monetization — *private beta / Paddle replacement in progress*

Billing/trials and plan limits exist. Phase 6 added normalized plan/developer
access structures (`071`) and atomic usage reservations (`072`); Phase 7 added
member-seat atomicity (`076`); Phase D added the commercial-readiness schema
(`096`).

The payment provider has been narrowed to **Paddle only**. The repository
default is **Private Beta** (`BILLING_MODE=private_beta`), so self-serve
checkout and Customer Portal are intentionally unavailable until the Paddle
checkout, webhook, portal, and smoke-test pass is complete.

Remaining:
- Configure `BILLING_MODE=paid_beta`, `BILLING_PROVIDER=paddle`, Paddle secrets
  and paid Price IDs outside the repo before enabling self-serve checkout.
- Activate paid plans only from trusted provider webhooks; `success_url` must
  remain display-only.
- Keep public pricing on `modules/billing/public-plan-view.ts`; landing and
  `/pricing` must not add their own tariff numbers.
- Continue retiring legacy `checkPlanLimit` paths where Phase D services now
  provide the commercial gate.
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
- Paddle runtime configuration and checkout/webhook/portal implementation are
  still pending, so paid self-serve checkout is not operational.
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
