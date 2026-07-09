# P0 / P1 Issue Register — Release Closure

Tracks the release-blocking (P0) and high (P1) issues found during Phase A–D
closure, with owner and state. Public launch stays **No-Go** while any P0/P1 is open.

**Owners**
- **Release owner:** maintainer (nevorahq@gmail.com)
- **Incident owner:** maintainer
- **Billing-data owner:** maintainer

**State legend:** `OPEN` · `FIXED (in tree)` · `FIXED (applied/verified)` · `ACTION REQUIRED (human)`

---

## P0

| ID | Issue | State | Evidence / Fix |
|---|---|---|---|
| **I-01** | Booking anon **data** surface open despite 404 routes: anon could READ `booking_pages`/host/service tables and EXECUTE the `SECURITY DEFINER` write RPC `create_booking_request_public`. | **FIXED (applied/verified)** | Migration `098` (applied on remote). Verified 2026-07-09: anon → `42501` on tables, `401` on the RPC. Harness `supabase/tests/098_*` (negative-tested). |
| **I-02** | Draft confirmation not exactly-once: a crash between entity creation and `accepted_entity_id` write duplicated the task on retry; `createFinancialTask` idempotency was decorative (no unique index). | **FIXED (applied/verified)** | Migration `099` (applied): 4 unique indexes; `todos.source_suggestion_id` live (`200`). Direct proof: duplicate insert accepted without the index, rejected with it. |
| **I-03** | Real Stripe **test** secret key present in local git object store (public repo). | **FIXED (in tree) + ACTION REQUIRED** | Never published (not in any commit on `main`, not on remote; only in local `refs/codex/*` snapshots, now pruned + gc'd). **Human action still required: rotate the key in the Stripe Dashboard** (I-07). |

## P1

| ID | Issue | State | Evidence / Fix |
|---|---|---|---|
| **I-04** | Migration baseline lies: docs claimed `000`–`093` "93 files, no gaps" while the tree was `000`–`097` and `054` is absent; release docs did not match DB state. | **FIXED (applied/verified)** | Docs corrected to `000`–`099`, `054` a known gap; remote confirmed by object probes. |
| **I-05** | Pricing mismatch: catalog (USD) vs landing (EUR), two sources of truth, business plan disagreed on storage/seats. | **FIXED (verified)** | Single source `plan-catalog.ts` (EUR, matches enforced `plan_limits`); both surfaces render via `getPublicPlanViews()`. Runtime: `/pricing` and `/` both €9/€29/€69, zero USD. |
| **I-06** | Billing mode ambiguous — UI could imply a paid checkout that cannot complete (no `STRIPE_*` config). | **FIXED (verified)** | Explicit **private beta**: CTAs are "Request access" / "Private beta"; `stripe-env.ts` fails closed in prod when mode=stripe but config missing. |
| **I-08** | Phase D enforcement not wired: `featureGateService` / `usageService` had zero external references. | **FIXED (verified)** | Now guard `documents.process`, `ai.suggestions.generate`, `storage.files.upload`, server-side before the costly step; block path unit-tested; upload reservation is leak-safe. |

## Open action items (not code blockers, but required before public launch)

| ID | Item | Owner | State |
|---|---|---|---|
| **I-07** | **Rotate the Stripe test key** in the Stripe Dashboard (the leaked one, even though it was never published). | Billing-data owner | **ACTION REQUIRED** |
| **I-09** | Run the **interactive smoke suite** (upload→extract→confirm→transaction, mark-as-paid idempotency, cross-org isolation, notifications read≠resolve, Capture Inbox) against a deployed authed environment. Currently **NOT EXECUTED** (see smoke report). | Release owner | **OPEN** |
| **I-10** | Line-by-line review of the parallel-session `§7`/`§8` code (billing checkout/portal, document/AI gates) — committed green (typecheck+1011 tests) but not deeply reviewed in this session. | Release owner | **OPEN** |
| **I-11** | Run `next build` and a fresh `supabase db reset` + `supabase test db` in CI before deploy. | Release owner | **OPEN** |
| **I-12** | Replace placeholder landing contact channels before public launch (if not final). | Release owner | **OPEN** |

---

## Roll-up

- **P0:** 0 open (I-01, I-02 fixed+verified; I-03 fixed in tree, rotation tracked as I-07).
- **P1:** 0 open (all fixed/verified).
- **Blocking public launch:** I-07 (key rotation) and I-09 (interactive smoke evidence)
  remain. Until both are closed, public launch is **No-Go**; **private beta** is viable.
