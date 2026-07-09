# Smoke Test Report — 2026-07-09 (Paddle branch, local)

**Status legend:** `PASS` (evidence recorded) · `FAIL` (issue logged) ·
`BLOCKED` (cannot run — missing dependency) · `NOT EXECUTED` (no environment to run it).

> This is the **post-merge, local** smoke for the Paddle billing replacement,
> distinct from [`smoke-test-report-2026-07-09.md`](./smoke-test-report-2026-07-09.md)
> (the `bb9c486` Phase A–D snapshot). It covers only what is verifiable **without a
> deployed, authenticated environment**: public routes, the anon REST surface,
> cron auth, currency rendering, paused modules, and the automated gates. Every
> scenario needing a logged-in user against real data is **NOT EXECUTED** — see
> I-09 in [`p0-p1-issue-register.md`](./p0-p1-issue-register.md). Do not read this
> as public-launch readiness.

## Environment

| | |
|---|---|
| **Commit** | `331f154` (branch `billing-paddle-replacement-20260709`) — content-identical to the squash merge `676b73b` on `main` |
| **Migration baseline** | tree `000`–`101` (`054` a known gap); remote `100`/`101` applied (Paddle billing boundary) |
| **App** | local `next dev` (Next 16.2.7) on `http://localhost:3000` — **not** a deployed prod build |
| **Database** | remote Supabase `uimpykbnatzhykzpastd` via REST (public anon key) |
| **Auth session** | none — unauthenticated only |

---

## Scenarios

### S1 · Public / marketing routes reachable — PASS
- **Expected:** public + new localized/legal routes return `200`; the `/privasy`
  typo route redirects to `/privacy`.
- **Actual:** `/`, `/pricing`, `/login`, `/register`, `/en`, `/ro`, `/ru`,
  `/privacy`, `/terms`, `/refunds`, `/sitemap.xml`, `/manifest.webmanifest` → **200**.
  `/privasy` → **307** (redirect to `/privacy`).

### S2 · Booking anon data surface is closed (anon REST — migration 098) — PASS
- **Expected:** anon cannot read the booking tables or execute the public write RPC.
- **Actual:** `booking_pages`, `booking_host_profiles`, `booking_services` → **`42501`
  permission denied** (anon has no privilege). Public RPC
  `create_booking_request_public` → **HTTP 404**.
- **Note:** the `bb9c486` report recorded `401` for the RPC; this run saw `404`. Same
  security outcome — migration 098 revoked `EXECUTE`, so PostgREST hides the function
  from the `anon` role (404) rather than authorizing then rejecting it (401). Anon
  cannot invoke it either way.

### S3 · Currency is EUR everywhere, no fake USD checkout — PASS
- **Expected:** `/` and `/pricing` render `€9`/`€29`/`€69`; no visible USD prices;
  private-beta / request-access CTA present (no live checkout).
- **Actual:** `€9`, `€29`, `€69` on both `/` and `/pricing`. After stripping
  `<script>` bundles, **zero** `$`-amounts remain in the markup (the raw-HTML `$NN`
  hits were dev-mode webpack tokens, not prices). "Request access" / "private beta"
  CTA present.

### S4 · Cron endpoints fail closed — PASS
- **Expected:** `/api/cron/*` without an auth header is **not** `200`.
- **Actual:** `reminders`, `extraction-sweep`, `subscription-sweep`,
  `suggestions-sweep`, `trial-sweep` → **401**.

### S5 · Paused modules not served — PASS
- **Expected:** CRM/Booking surfaces do not return `200`.
- **Actual:** `/booking`, `/dashboard/crm`, `/dashboard/booking` → **307** (redirect,
  not served).

### S6 · Automated gates — PASS
- **Expected:** typecheck, lint, unit tests, and prod build all green.
- **Actual:** `next typegen && tsc --noEmit` **clean**; `eslint` **clean**;
  `vitest run` **1009 passed / 3 skipped** (157 files); `next build` **compiled
  successfully**, 56/56 static pages.

### S7 · Migration baseline aligned (docs vs tree vs remote) — PASS
- **Expected:** tree `000`–`101` (gap at `054`), remote applied through `101`, docs match.
- **Actual:** 101 files, no duplicate prefixes, `054` absent (known gap). Remote
  `100`/`101` applied (confirmed by the maintainer). Release docs re-synced to
  `000`–`101`.

---

## NOT EXECUTED (require a deployed, authenticated environment — I-09)

- Register → `/onboarding`; login/logout; create org → `/dashboard`.
- Cross-org isolation (open org A's record id as an org-B user → safe not-found).
- Action Center authed render + org-scoped feed.
- Upload → extract → confirm → posted transaction.
- Mark-as-paid idempotency (double-click + refresh → exactly one transaction).
- Paddle checkout / webhook / portal (private beta — no paid runtime config).

## Verdict

The unauthenticated surface of the Paddle branch is **clean**: public routes serve,
the booking anon surface stays closed, pricing is EUR-only with no fake checkout,
cron fails closed, paused modules are not served, and every automated gate is green.
Public-launch readiness is still **No-Go** until the interactive suite (I-09) runs
against a deployed authed environment and I-07 (key rotation) closes.
