# Release Evidence — Phase A–D Closure — 2026-07-09

> **Snapshot — do not rewrite the tested commit.** This records the Phase A–D
> closure smoke exactly as run against commit `bb9c486` on 2026-07-09. It is kept
> as historical evidence. The **current release line** has since moved on: branch
> `billing-paddle-replacement-20260709`, committed HEAD `6cf165f`, migration
> baseline `000`–`101` (Paddle billing replacement + boundary migrations
> `100`/`101`, applied on remote). For current state see
> [`release-checklist.md`](./release-checklist.md). The Stripe→Paddle wording
> below reflects the renamed provider; the commit and baseline figures are frozen
> at what was actually tested.

Consolidated evidence for the release-blocker closure. Companion docs:
[`smoke-test-report-2026-07-09.md`](./smoke-test-report-2026-07-09.md) (per-scenario)
and [`p0-p1-issue-register.md`](./p0-p1-issue-register.md) (issues + owners).

## Branch / Commit

- **Branch:** `release/phase-a-d-closure`
- **Head:** `bb9c486`
- **Closure commits:**
  - `e1d8023` docs(release): repair migration baseline and remove false readiness claims
  - `936a800` docs(security): record legacy payment key purge; avoid self-matching scan patterns
  - `d96a35d` feat(security): 098 — close Booking's anon data surface (read + write)
  - `e2307ee` feat(planner): 099 — draft confirmation exactly-once at the database
  - `fc51d76` feat(billing): pricing/landing single-source in EUR (private beta) + §7/§8 scaffolding
  - `c8dd70b` fix(build): stop tracking auto-generated next-env.d.ts
  - `fd25300` test(billing): 8 — prove document-processing enforcement blocks before OCR
  - `bb9c486` feat(action-center): 9 — add Money Attention as the 4th daily-screen section
- **Working tree:** clean.

## Blockers closed

- [x] Working tree preserved in git (was already committed + pushed; branch created)
- [x] Legacy payment secret removed from tree/history — **rotation still pending** (I-07)
- [x] Migration baseline repaired (`000`–`099`, next free `100`; `054` a known gap)
- [x] Booking anon SELECT **and** the SECURITY DEFINER write RPC closed (098, applied)
- [x] Draft confirmation exactly-once, DB-enforced (099, applied)
- [x] Landing/pricing unified — one source, EUR (verified at runtime)
- [x] Billing mode made explicit — private beta (no fake checkout)
- [x] Feature/usage enforcement connected to documents/AI/storage (block path tested)
- [x] Upgrade prompt moved to the value boundary (document extraction review)
- [x] Money Attention section added to the Action Center
- [x] Smoke/release evidence recorded — **partial and honest** (this set of docs)

## Database / RLS changes

- **098** — revokes `anon` SELECT policies + table privileges on the six booking
  tables and `EXECUTE` on both public booking RPCs; RLS stays on; data preserved;
  `authenticated` untouched. Applied on remote (anon → `42501`/`401`, verified).
- **099** — `todos.source_suggestion_id` + `todos_source_suggestion_unique_idx` +
  `todos_financial_source_unique_idx`; asserts all four exactly-once indexes exist.
  Applied on remote (`source_suggestion_id` → `200`).
- No RLS weakened. Both migrations negative-tested by their `supabase/tests/` harnesses.

## Billing / monetization changes

- **Billing mode:** explicit **private beta** (`BILLING_MODE=private_beta` default).
  No paid Paddle runtime config; checkout intentionally disabled; `paddle-env.ts`
  fails closed in production when paid mode is missing secrets/price IDs.
- **Plan catalog:** single source of truth `modules/billing/plan-catalog.ts`, **EUR**
  (typed literal), matching the enforced `plan_limits` on remote.
- **Public surfaces:** `/pricing` and landing both render from `getPublicPlanViews()`
  — €9/€29/€69, private-beta CTAs, no checkout button.
- **Feature gates:** `featureGateService`/`usageService` guard `documents.process`,
  `ai.suggestions.generate`, `storage.files.upload` server-side before the costly
  step; usage reservation is release-safe on failure. Legacy `checkPlanLimit` remains
  for `ai_calls`/members; CRM `clients`/`deals` limits sit behind the paused gate.

## Security checks

- **Secrets scan:** working tree clean — `rg 'sk_(test|live)_…|whsec_…|pk_live_…'`
  returns nothing but its own documentation; git history clean after ref prune + gc.
  **Pending:** rotate the (never-published) leaked test key (I-07).
- **Anon Booking access:** closed at the data layer (098) — verified with the public
  anon key.
- **Cross-org:** structural coverage (`paused-modules.coverage.test.ts`, RLS); the
  interactive cross-org safe-not-found check is **NOT EXECUTED** (I-09).
- **Service role:** not introduced into request-path logic by this closure.
- **Cron:** fail-closed — `/api/cron/*` → 401 without auth (verified).

## Tests run

| Command | Result |
|---|---|
| `next typegen && tsc --noEmit` | **clean** |
| `eslint` | **clean** |
| `vitest run` | **1011 passed**, 3 skipped |
| `supabase/tests/098_*`, `099_*` (local, earlier) | **pass** (negative-tested) |
| public-route / anon-REST / cron / currency `curl` probes | **pass** (see smoke report) |
| `next build` | **NOT EXECUTED** this session (dev server active) |

## Release status

### PRIVATE BETA READY

The nine release blockers (§1–§9) are closed and, where they touch the database or
public surfaces, **verified**. Billing is honestly private beta; migrations are
baseline-aligned and applied; Booking's anon surface is closed; no real secret is in
the tree.

**Not PUBLIC RELEASE CANDIDATE.** Per the release criteria, public launch requires
interactive smoke evidence and an empty P0/P1 action list — neither holds yet:

- **I-09** — the interactive smoke suite (upload→extract→confirm→transaction,
  mark-as-paid idempotency, cross-org isolation, read≠resolve, Capture Inbox) is
  **NOT EXECUTED**; no deployed authed environment was available.
- **I-07** — the leaked payment test key must be **rotated** in the provider dashboard.
- **I-10/I-11** — parallel-session §7/§8 code needs review; `next build` + a fresh
  `supabase db reset`/`supabase test db` must pass in CI.

Public launch stays **No-Go** until I-07 and I-09 close.

## Remaining risks

1. **Interactive flows unproven at runtime** (I-09) — the money-critical invariants
   (confirm-first posting, mark-as-paid idempotency) have unit coverage but no
   end-to-end run against real data this session.
2. **Leaked key not yet rotated** (I-07) — low exposure (never published) but a real
   credential; rotate before any wider exposure.
3. **§7/§8 authored by a parallel session** (I-10) — committed green but not reviewed
   line-by-line here; billing checkout/portal and document/AI gates should get a
   focused review.
4. **`next build` not run this session** (I-11) — typecheck passes, but a full prod
   build has not been exercised on this commit.
5. **Local Supabase can mislead** — a from-scratch `supabase db reset` grants SELECT
   to no role, so anon-denial tests can pass vacuously; always reproduce a leak
   against prod-like grants before trusting a "closed" result.
