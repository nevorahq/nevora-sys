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
| **I-03** | Real legacy payment **test** secret key present in local git object store (public repo). | **FIXED (in tree) + ACTION REQUIRED** | Never published (not in any commit on `main`, not on remote; only in local `refs/codex/*` snapshots, now pruned + gc'd). **Human action still required: rotate the key in the provider dashboard** (I-07). |

## P1

| ID | Issue | State | Evidence / Fix |
|---|---|---|---|
| **I-04** | Migration baseline lies: docs claimed `000`–`093` "93 files, no gaps" while the tree was `000`–`097` and `054` is absent; release docs did not match DB state. | **FIXED (applied/verified)** | Docs corrected to `000`–`101` (101 files, `054` a known gap); remote confirmed by object probes. Living checklist re-synced 2026-07-09 for the Paddle boundary migrations `100`/`101`. |
| **I-05** | Pricing mismatch: catalog (USD) vs landing (EUR), two sources of truth, business plan disagreed on storage/seats. | **FIXED (verified)** | Single source `plan-catalog.ts` (EUR, matches enforced `plan_limits`); both surfaces render via `getPublicPlanViews()`. Runtime: `/pricing` and `/` both €9/€29/€69, zero USD. |
| **I-06** | Billing mode ambiguous — UI could imply a paid checkout that cannot complete (no Paddle config). | **FIXED (verified)** | Explicit **private beta**: CTAs are "Request access" / "Private beta"; `paddle-env.ts` fails closed in prod when paid mode is missing config. |
| **I-08** | Phase D enforcement not wired: `featureGateService` / `usageService` had zero external references. | **FIXED (verified)** | Now guard `documents.process`, `ai.suggestions.generate`, `storage.files.upload`, server-side before the costly step; block path unit-tested; upload reservation is leak-safe. |

## Open action items (not code blockers, but required before public launch)

| ID | Item | Owner | State |
|---|---|---|---|
| **I-07** | **Rotate the leaked payment test key** in the provider dashboard, even though it was never published. | Billing-data owner | **ACTION REQUIRED** |
| **I-09** | Run the **interactive smoke suite** (upload→extract→confirm→transaction, mark-as-paid idempotency, cross-org isolation, notifications read≠resolve, Capture Inbox) against a deployed authed environment. Currently **NOT EXECUTED** (see smoke report). | Release owner | **OPEN** |
| **I-10** | Line-by-line review of the parallel-session `§7`/`§8` code (billing checkout/portal, document/AI gates). | Release owner | **REVIEWED 2026-07-09** — one HIGH found + fixed: `/api/billing/webhook` was not a machine route, so the proxy 307-redirected Paddle's session-less POST to `/login` and the handler never ran (paid events silently dropped once live). Fixed in PR #9 → main `0c1d6d4` (added to `MACHINE_ROUTES` + `routes.test.ts` drift guard; verified 307→503-handler). §7 (checkout authz, HMAC webhook verify + idempotent RPC, fail-closed env) and §8 (pre-OCR gates, non-decorative usage counting, leak-safe upload reservation) reviewed clean. Remaining **low** (not blockers, tracked below as I-13): server-action input re-validation on `createCheckoutSessionForCurrentOrganization`; the timestamp-less signature fallback branch; assert-only soft usage-limit races. |
| **I-11** | Run `next build` and a fresh from-scratch DB apply + SQL harnesses in CI before deploy. | Release owner | **CI DONE / deploy gate open** — CI job `db` (`.github/workflows/ci.yml`, PR #7 → main `bae9f32`) seeds hosted-like grants, applies migrations `000`–`101` from scratch via psql, and runs all `supabase/tests/*.sql` (green 2026-07-09); `build` runs in the `verify` job. The harnesses are psql scripts, not pgTAP, so `psql` is used instead of `supabase test db`. Remaining: run this same CI green **on the deploy commit** before shipping. |
| **I-12** | Replace placeholder landing contact channels before public launch (if not final). | Release owner | **OPEN** |
| **I-13** | Low-severity billing hardening from the I-10 review (non-blocking). | Release owner | **(a),(b) DONE / (c) deferred** — (a) `createCheckoutSessionForCurrentOrganization` now re-parses its input with `changePlanSchema`; (b) `verifyBillingWebhookSignature` requires an explicit `t=`+`v1=` (timestamp-less fallback removed, replay window always enforced) — both with tests. (c) reserve-not-assert `storage_used_bytes` is **deferred**: it needs a migration (add a storage key to the `reserve_organization_usage` RPC) and a rethink of storage accounting (today `storage.bytes` is derived from `document_attachments.file_size`, so a counter would double-count) — too much for a pure-code low pass. Current behaviour is a self-correcting soft-limit race. |

---

## Roll-up

- **P0:** 0 open (I-01, I-02 fixed+verified; I-03 fixed in tree, rotation tracked as I-07).
- **P1:** 0 open (all fixed/verified).
- **Blocking public launch:** I-07 (key rotation) and I-09 (interactive smoke evidence)
  remain. Until both are closed, public launch is **No-Go**; **private beta** is viable.
