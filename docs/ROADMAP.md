# Roadmap — Nevora Business OS

> Source-of-truth roadmap. Status reflects `main` on **2026-09-29**: migrations
> `000`–`125` in the tree and applied on remote (next free `126`; `054` is a
> known gap), CI green (`verify`, `db`, `secrets`), production on Netlify in
> **private beta**. Per-module detail: [`MODULE_STATUS.md`](./MODULE_STATUS.md).
> Verify the migration head against the tree (`ls supabase/migrations | tail -1`)
> and remote by probing an object the migration creates — never by trusting a doc.

## Where we are

The engineering roadmap through the controlled beta is **done**. What decides the
next step is product evidence, not code:

- **Product:** one workspace — capture from the app, Telegram, Slack or email →
  Nevora drafts a task or an expense → the user confirms; the Action Center
  shows what is left. Tasks, Finance and Subscriptions are separate products
  that do not write into each other.
- **Safety gate:** green, every row backed by a test
  ([`release/launch-readiness-2026-07-22.md`](./release/launch-readiness-2026-07-22.md));
  0 open P0/P1 ([`release/p0-p1-issue-register.md`](./release/p0-p1-issue-register.md)).
- **Activation gate:** not started — no beta results recorded yet.

## Next

**Product owner**
1. Run the controlled beta with 5 live users and fill
   [`release/beta-report-TEMPLATE.md`](./release/beta-report-TEMPLATE.md). The
   paid-beta trigger is ≥ 3 of 5 passing without hand-holding, not a date.
2. Fill the launch-gate §2 and name the owners (release, incident, billing/data,
   security) in [`release/launch-gate-checklist.md`](./release/launch-gate-checklist.md).
3. Decide Overview / Analytics / AI pages: relink in the navigation or retire.
4. Decide when (if ever) Tasks moves past `shadow` — see ADR 001.

**Engineering, before paid beta**
- Paddle end to end in sandbox: checkout → webhook → portal, then
  `BILLING_MODE=paid_beta` ([`release/paid-beta-cutover-checklist.md`](./release/paid-beta-cutover-checklist.md)).
- Live smoke of the channel paths not yet exercised: Telegram media, email
  attachments, Gmail forwarding confirmation; voice once the transcription
  provider is funded.

**Engineering, before public launch**
- I-07: rotate the legacy payment test key.
- Transfer organization ownership (issue #39) — unblocks account deletion for owners.
- Keep Netlify funded: crons and deploys stop when it is suspended.

## Delivered

| When | What |
| --- | --- |
| 2026-06 → 07-08 | **Phase 0 / A** — docs as source of truth, CI, Action Center as `/dashboard`, CRM and Booking hard-gated at pages, actions, route handlers and (`098`) the database |
| 2026-07 | **Phases B, D** — confirm-first hardening, first-action wizard, draft review, empty states, activation telemetry, feature/usage enforcement (`featureGateService` / `usageService`) |
| 2026-07-09 → 10 | **Billing → Paddle only** (`100`/`101`); checkout, portal and a Paddle-format webhook implemented (#17, #19); private beta by default |
| 2026-07 | **Security phases 7 and 9** — all P0/P1 closed; Analytics entitlement + RLS; PII sanitizing at event/audit sinks |
| 2026-07-16 | **Three languages** — landing, legal and app in en / ru / ro (`106`) |
| 2026-07-21 → 22 | **H2 Sprints 1–6** — navigation reduction, unified attention model, Money workspace + canonical financial states, AI governance, job reliability register, usage reconciliation (`112`), activation metrics + launch gate |
| 2026-07-23 → 24 | **Landing** rebuilt around the real product (four waves) |
| 2026-08-21 → 22 | **ADR 001** — Tasks, Finance, Subscriptions behind ports with standalone `apps/*`; Tasks staged (`114`). **Products stop bridging** (`115`): Financial Tasks and the `mark_*_paid` RPCs removed |
| 2026-09-23 | Product routes `/tasks`, `/finance`, `/subscriptions`; Gmail invoice import (`116`); renewal decision inbox (`117`); Tasks pages read through the seam; Tasks held in `shadow` |
| 2026-09-28 → 29 | **One app shell** (#75). **ADR 002** — honest Inbox (`119`), receipt scan (`120`), channel intake + Telegram (`121`, `122`), email forwarding (`123`), voice (`124`), Slack, project classification with learned rules (`125`). Landing rewritten for one workspace |

## Phases

Phase numbers are kept from the original plan so older notes still map.

### Phase 1 — Core Foundation — *done*
Auth, organizations, workspaces, session context (`requireUser`/`requireOrg`),
`proxy.ts` gating, onboarding, invites. One organization per account until paid beta.

### Phase 2 — Security Layer — *done / ongoing*
RLS with `WITH CHECK`, SECURITY DEFINER RPC with pinned `search_path` and explicit
grants (`035`, `037`), fail-closed cron and metrics secrets, signed machine routes
(see [`SECURITY.md`](./SECURITY.md)). Every new table and webhook must comply.

### Phase 3 — Tasks / Finance / Documents / Subscriptions — *MVP ready*
All four are MVP Ready. Since `115` Tasks is a plain to-do list with projects,
and Subscriptions keeps its own payment cycles without posting to Finance.
Remaining: route the manual "New task" form through the Tasks seam (it still
inserts directly); retire the legacy `renewSubscriptionAction`.

### Phase 4 — Cross-module relations — *in progress*
`entity_links` (`047`) across Tasks, Finance, Documents and Subscriptions,
resolved from one `RELATION_ENTITY_CONFIG`; links are informational only. Needs
consistent link-management UX.

### Phase 5 — Automation foundation — *foundation*
Domain-event dispatch, handlers and logs (`040`/`042`); reminders (`075`, `118`);
eight Netlify-scheduled sweeps. No user-facing rules engine; auto-accept of
drafts is explicitly not decided.

### Phase 6 — Action Center — *done*
Primary read-only screen at `/dashboard`: filter cards over one predicate, an
attention list that routes to the owning module, stale items auto-closed.
Open: move `syncActionItems()` fully to the sweep; retire the unused backend
executors.

### Phase 7 — Documents automation — *done for the Inbox path*
Upload / photo / scan → extraction → expense draft **or** task drafts → confirm.
Receipt codes (EPC/SEPA, Swiss QR, SFS, EAN) re-parsed server-side. Open: verify
the SFS format on a real receipt; duplicate-detection UX.

### Phase 7b — Multichannel capture (ADR 002) — *done*
Telegram (text, media, voice), Slack shortcut, email forwarding; one intake;
project rules learned from corrections. Open: the live smokes listed under *Next*.

### Phase 8 — Analytics — *partial, unlinked*
Page exists but has no navigation entry; still shows CRM metrics (accepted debt).

### Phase 9 — AI — *assistant only*
AI powers capture intent, extraction and transcription, always as drafts and
metered against one monthly quota. The insights/recommendations page exists but
is unlinked. Never an autonomous agent.

### Phase 10 — SaaS monetization — *code complete, private beta*
Plans in EUR from `modules/billing/plan-catalog.ts`; trial lifecycle; atomic
usage reservations; Paddle checkout / portal / webhook implemented but never run
end to end in sandbox. Remaining: that sandbox run, then paid beta.

### Phase 11 — Notifications & reminders — *done*
Delivery and preferences (`073`), tab indicator (`074`), reminders (`075`),
durable history (`111`), mandatory notifications. Open: production check of
browser permissions and quiet hours.

### Phase 12 — Production hardening & controlled beta — *engineering done*
Safety gate verified; job reliability register; rollback and incident runbooks;
CI applies every migration from scratch. Remaining is the controlled beta itself.

### Product-module extraction (ADR 001) — *optional*
All three products have standalone apps; only Tasks is deployed (staging,
`shadow` in production). Further cutover is a product decision, not a blocker.

## Parked / paused

- **CRM / Clients** and **Booking** — implemented, paused and closed at every
  surface. Un-pausing is a product decision with a checklist in `MODULE_STATUS.md`.
