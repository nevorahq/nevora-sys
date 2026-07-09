# Smoke Test Report — 2026-07-09

> **Snapshot — do not rewrite the tested commit.** This is the smoke run as
> executed against commit `bb9c486` (baseline `000`–`099`) on 2026-07-09, kept as
> historical evidence. The **current release line** has since moved to branch
> `billing-paddle-replacement-20260709`, committed HEAD `6cf165f`, baseline
> `000`–`101` (`100`/`101` = Paddle billing boundary, applied). This run has NOT
> been re-executed against the Paddle branch. For current state see
> [`release-checklist.md`](./release-checklist.md).

**Status legend:** `PASS` (evidence recorded) · `FAIL` (issue logged) ·
`BLOCKED` (cannot run — missing dependency) · `NOT EXECUTED` (no environment to run it).

> This report is **partial and honest**. There is no deployed, authenticated,
> production-like environment available in this session, so every scenario that
> needs a logged-in user against real data is marked **NOT EXECUTED** — not ticked.
> What *could* be verified without auth (public routes, anon REST surface, cron
> auth, currency rendering, migration state, automated gates) was actually run and
> its output recorded below. Do not read this as public-launch readiness; see the
> verdict in `release-evidence-2026-07-09.md`.

## Environment

| | |
|---|---|
| **Commit** | `bb9c486` (branch `release/phase-a-d-closure`) |
| **Migration baseline** | tree `000`–`099`; remote applied `000`–`099` (probed) |
| **App** | local `next dev` (Next 16.2.7) on `http://localhost:3000` — **not** a deployed prod build |
| **Database** | remote Supabase `uimpykbnatzhykzpastd` via REST (service-role + public anon key) |
| **Auth session** | none — unauthenticated only |
| **Billing mode** | `private_beta` (no paid Paddle runtime config) |

---

## Executed — PASS (evidence recorded)

### S1 · Booking public surface is closed (route layer)
- **Steps:** `curl` the public booking routes unauthenticated.
- **Expected:** 404 (paused module), including the POST write path.
- **Actual / Evidence:**
  - `GET /booking/some-org` → **404**
  - `GET /api/public/booking/page` → **404**
  - `POST /api/public/booking/requests` → **404**
- **Status:** PASS

### S2 · Booking data surface is closed (anon REST — migration 098)
- **Steps:** hit Supabase REST directly with the **public anon key**.
- **Expected:** denied — a closed route is not enough; the data must be closed too.
- **Actual / Evidence:**
  - `GET /rest/v1/booking_pages` → **HTTP 401, code `42501`** ("permission denied")
  - `POST /rest/v1/rpc/check_client_booking_conflict_public` → **HTTP 401**
- **Status:** PASS · closes the release-blocking P0 (see register I-01)

### S3 · Exactly-once confirm schema is live (migration 099)
- **Steps:** probe the column the app depends on.
- **Expected:** present on remote before the app that writes it.
- **Actual / Evidence:** `GET /rest/v1/todos?select=source_suggestion_id` → **HTTP 200**
- **Status:** PASS

### S4 · Cron routes fail closed
- **Steps:** `curl` cron routes with **no** `Authorization` header.
- **Expected:** not 200.
- **Actual / Evidence:** `/api/cron/reminders` → **401**; `/api/cron/extraction-sweep` → **401**
- **Status:** PASS

### S5 · Health endpoint answers unauthenticated
- **Steps:** `curl -i /api/health` with no cookies.
- **Expected:** 200 (monitoring sends no session).
- **Actual / Evidence:** `GET /api/health` → **200**
- **Status:** PASS

### S6 · Pricing and landing agree, in EUR, private-beta CTAs (§6/§7)
- **Steps:** render `/pricing` and `/`, scan for currency + CTA.
- **Expected:** identical EUR prices from one source; no USD; no paid-checkout button.
- **Actual / Evidence:**
  - `/pricing` → **€9 / €29 / €69**, zero USD price strings; CTAs "Request access" / "Private beta"
  - `/` (landing) → **€9 / €29 / €69**
- **Status:** PASS

### S7 · Automated gates
- **Steps:** `next typegen && tsc --noEmit`; `eslint`; `vitest run`.
- **Expected:** all green.
- **Actual / Evidence:** typecheck **clean**; lint **clean**; **1011 passed** / 3 skipped.
- **Status:** PASS

### S8 · Migration baseline aligned (docs vs tree vs remote)
- **Steps:** compare `ls supabase/migrations`, docs, and remote object probes.
- **Expected:** tree `000`–`099` (gap at `054`), remote applied through `099`, docs match.
- **Actual / Evidence:** 99 files, no duplicate prefixes; `096` (seeded `plan_entitlements`),
  `097` (`document_processing_results`/`financial_suggestions`), `098` (anon denied),
  `099` (`source_suggestion_id`) all confirmed on remote.
- **Status:** PASS

---

## Partially covered by automated tests, NOT executed at runtime

These have unit/contract coverage (green) but were **not** exercised against a
running authed system, so runtime behaviour is unproven here.

| Scenario | Test coverage | Runtime |
|---|---|---|
| Document processing limit → `usage_limit_exceeded`, no OCR | `document-extraction-service.test.ts` | NOT EXECUTED |
| UpgradePrompt at the limit boundary | `document-extraction-review` render | NOT EXECUTED |
| Money Attention section grouping | `phase-b-sections.test.ts`, `action-feed.test.tsx` | NOT EXECUTED (no authed dashboard) |
| Paddle webhook signature validation | Paddle adapter tests | BLOCKED (private beta) |
| Private-beta billing CTA (no checkout session) | `plan-catalog.test.ts` | NOT EXECUTED (needs authed billing page) |
| Mark-as-paid idempotency | RPC + service tests | NOT EXECUTED |

---

## NOT EXECUTED — require an authenticated, production-like environment

No deployed environment and no logged-in session were available. Each of these must
be run by a human before public launch.

- Register / login / logout / onboarding
- Create organization; multi-org switch changes data
- Cross-org isolation: org B opening org A's record id → safe not-found, never 500
- Server-side `organization_id` resolution (tamper with client-supplied id → ignored)
- Document upload (PDF + image) → extraction → **draft/review** item
- ⚑ Extraction posts **no** transaction; confirm draft → exactly one posted transaction; reject → nothing
- ⚑ Subscription create posts no transaction; attaching a document posts no transaction
- ⚑ Mark-as-paid twice → one transaction, `already_paid` on the second, schedule advances once
- Action Center: `/dashboard` is the Action Center; sections render (incl. Money attention)
- ⚑ Notifications mark-all-read → unread 0 **but** obligations still shown (read ≠ resolved)
- Capture Inbox accept / edit / reject; accepting never posts money; owner-scoped
- Paused dashboard routes (`/dashboard/crm`, `/dashboard/booking`) → **404 under auth**
  (unauthenticated they 302 to `/login`, which is the auth gate, not the paused gate — see note)
- CRM/Booking Server Actions reject when POSTed directly
- Developer Access: create/revoke API key; `/api/v1/me` honours it

> **Note on the dashboard paused-module 404.** `GET /dashboard/crm` returned **302**
> (redirect to `/login`) unauthenticated — the auth layer fires before the paused
> gate, so the 404 is only observable with a session. The *public* paused surface
> (`/booking/*`, `/api/public/booking/*`) is observable and returned 404 (S1). The
> Server-Action gate is covered structurally by `paused-modules.coverage.test.ts`.

---

## Not run this session

- `next build` (production build) — the dev server was occupying `.next`. Run it in
  CI / before deploy. Marked **NOT EXECUTED**, not passed.
- `supabase db lint` / `supabase test db` against a clean local — the harnesses
  (`supabase/tests/098_*`, `099_*`) were run earlier this session and passed
  (negative-tested); re-run on a fresh `supabase db reset` before release.
