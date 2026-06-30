# Roadmap — Nevora Business OS

> **Phase 0 is a stabilization phase added in front of the existing roadmap.**
> Earlier internal notes numbered phases differently (e.g. "Phase 2 — relations",
> "Phase 3 — Action Center" in project memory). Those map onto the phases below;
> nothing prior is deleted — Phase 0 is prepended and later phases renumbered
> around the stabilized foundation. Status reflects **2026-06-30**.

## Phase 0 — Stabilization & Source of Truth — *in progress*

Bring README, architecture, module status, roadmap, product copy, security and
CI into one consistent, honest state. No new business features.
- `docs/` source of truth (this set of files) created.
- README synced with the real project state.
- `typecheck` npm script added; lint / typecheck / build verified green.
- CI already runs install → typegen → typecheck → lint → test → build.

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
MVP Ready; Subscriptions is Partial. Remaining: broaden subscription lifecycle,
money balance-integrity hardening, document extraction reliability.

## Phase 4 — Cross Module Relations — *in progress*

`entity_links`-based relations (migration `047`) connecting Task ↔ Transaction ↔
Subscription ↔ Document. Module exists; needs consistent link-management UX.

## Phase 5 — Automation Foundation — *in progress*

Domain-event dispatch engine + handlers + logs (`040`/`042`). Plumbing is in
place with tests; no user-facing rules engine yet.

## Phase 6 — Action Center — *in progress*

Orchestration layer (`/dashboard/actions`, migration `048`) normalizing module
signals into `action_items`. Open follow-ups: cron-based generation and adding
it to the primary navigation.

## Phase 7 — Documents Automation — *partially started*

Document-to-Transaction pipeline (migrations `051`/`052`): receipt/invoice
upload → AI extraction → draft money transaction → Action Center confirm.
Working end-to-end; needs reliability and broader document types.

## Phase 8 — Analytics Layer — *partial*

Dashboard metrics, activity timeline, per-module stats exist. Next: aggregation
and caching, richer visualizations.

## Phase 9 — AI Layer — *partial*

Insights and recommendations via Anthropic exist. Direction: scheduled
generation, more domain-event-driven sources, summaries. **AI assistance is
scoped — not an autonomous business agent.**

## Phase 10 — SaaS Monetization — *planned*

Billing/trials and plan limits exist; real checkout/payment provider and
self-serve plan selection (wire landing `?plan=<id>`) are not built yet.

---

### Parked / paused

- **CRM / Clients** — implemented, Paused per product direction. Not marketed as
  an active feature; preserved as long-term direction only.
- **Booking** — implemented, hidden from navigation, **not part of the active MVP
  scope**. Needs a product decision: resurface vs. formal pause.

### Operational follow-ups (do not block Phase 0)

- **Verify whether migration `064` (task due-date history) is applied on the
  remote Supabase environment.** This is an operational follow-up and does not
  block the Phase 0 documentation commit (local checks are green). Do not apply
  remote migrations without a separate, coordinated task.
- Replace placeholder landing contact channels (`hello@nevora.com`, `@nevora`)
  with real ones before launch.
