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
| **I-03** | Real legacy payment **test** secret key present in local git object store (public repo). | **FIXED (in tree); rotation DEFERRED as I-07** | Never published (not in any commit on `main`, not on remote; only in local `refs/codex/*` snapshots, now pruned + gc'd). Dashboard rotation is tracked and **deferred** as I-07 (see below), not dropped. |

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
| **I-07** | **Rotate the leaked payment test key** in the provider dashboard, even though it was never published. | Billing-data owner | **DEFERRED 2026-07-10 by billing-data owner** — decision: rotate when connecting Paddle to production, not before. **Still a public-launch blocker** (see roll-up); deferral only reorders it, does not close it. Defensible because the key is a **test-mode Stripe key** (`sk_test_`), and the project no longer references Stripe at runtime (no `STRIPE_*` in code or env; billing provider is Paddle). Exposure re-checked 2026-07-10: gitleaks over the full history (51 commits) → no leaks; no `refs/codex/*` on the remote; GitHub secret-scanning + push-protection enabled with zero alerts; 0 matches across all local git objects. Residual risk is the plaintext-on-disk history (Time Machine, backups, other clones) that `git gc` cannot reach — which is exactly why rotation is still owed. Recurrence guarded since 2026-07-10 by gitleaks in CI + a pre-commit hook (PR #18 → main `9a5f0f2`). |
| **I-09** | Run the **interactive smoke suite** (upload→extract→confirm→transaction, mark-as-paid idempotency, cross-org isolation, notifications read≠resolve, Capture Inbox) against a deployed authed environment. | Release owner | **PARTIAL — strong pass 2026-07-11** (proof: [`phase-3-proof-report-2026-07-11.md`](./phase-3-proof-report-2026-07-11.md), PR #31). Run on deployed `bussines.nevorahq.com`. **PASS w/ evidence + SQL:** ops §13 (health/cron/booking anon-lockdown/migration baseline, 4 ⚑), §2 Action-Center-first, A-S1 login (register BLOCKED = remote email-confirmation ON), **A-S5/A2** subscription cycle ×2 → 1 cycle/1 tx, **A-S6/A3** plain task complete → Δtx 0, **A-S7** cross-org isolation → 3 record types 404, **A-S8** read≠resolve, **A-S9** Capture Inbox accept→task/reject→closed Δmoney 0. Two of three money invariants (**A2, A3**) proven live. **Remaining (tooling-blocked, not a code defect):** **A-S4/A1** (financial task ×2), **A-S2 upload leg**, **A-S3** — all gated by the in-app browser's lack of file upload; financial tasks only originate from uploaded documents. Finish via Claude-in-Chrome (real Chrome supports upload) or an operator run, then flip → **closed**. **Not closed** until A1 + the upload leg are proven. |
| **I-10** | Line-by-line review of the parallel-session `§7`/`§8` code (billing checkout/portal, document/AI gates). | Release owner | **REVIEWED 2026-07-09** — one HIGH found + fixed: `/api/billing/webhook` was not a machine route, so the proxy 307-redirected Paddle's session-less POST to `/login` and the handler never ran (paid events silently dropped once live). Fixed in PR #9 → main `0c1d6d4` (added to `MACHINE_ROUTES` + `routes.test.ts` drift guard; verified 307→503-handler). §7 (checkout authz, HMAC webhook verify + idempotent RPC, fail-closed env) and §8 (pre-OCR gates, non-decorative usage counting, leak-safe upload reservation) reviewed clean. Remaining **low** (not blockers, tracked below as I-13): server-action input re-validation on `createCheckoutSessionForCurrentOrganization`; the timestamp-less signature fallback branch; assert-only soft usage-limit races. |
| **I-11** | Run `next build` and a fresh from-scratch DB apply + SQL harnesses in CI before deploy. | Release owner | **CI DONE / deploy gate open** — CI job `db` (`.github/workflows/ci.yml`, PR #7 → main `bae9f32`) seeds hosted-like grants, applies migrations `000`–`101` from scratch via psql, and runs all `supabase/tests/*.sql` (green 2026-07-09); `build` runs in the `verify` job. The harnesses are psql scripts, not pgTAP, so `psql` is used instead of `supabase test db`. Remaining: run this same CI green **on the deploy commit** before shipping. |
| **I-12** | Replace placeholder landing contact channels before public launch (if not final). | Release owner | **OPEN** |
| **I-13** | Low-severity billing hardening from the I-10 review (non-blocking). | Release owner | **(a),(b) DONE / (c) deferred** — (a) `createCheckoutSessionForCurrentOrganization` now re-parses its input with `changePlanSchema`; (b) `verifyBillingWebhookSignature` requires an explicit `t=`+`v1=` (timestamp-less fallback removed, replay window always enforced) — both with tests. (c) reserve-not-assert `storage_used_bytes` is **deferred**: it needs a migration (add a storage key to the `reserve_organization_usage` RPC) and a rethink of storage accounting (today `storage.bytes` is derived from `document_attachments.file_size`, so a counter would double-count) — too much for a pure-code low pass. Current behaviour is a self-correcting soft-limit race. |

---

## Roll-up

- **P0:** 0 open (I-01, I-02 fixed+verified; I-03 fixed in tree, rotation deferred as I-07).
- **P1:** 0 open (all fixed/verified).
- **Blocking public launch:** I-07 (key rotation, **deferred** 2026-07-10 to the
  Paddle-production cutover — still a blocker, just re-ordered) and I-09
  (interactive smoke evidence) remain. I-09 is now **PARTIAL — strong pass**
  (2026-07-11): all non-upload scenarios PASS incl. money invariants A2/A3;
  the remainder (A1, A-S2 upload leg, A-S3) is blocked only by the in-app
  browser's lack of file upload — finish via Claude-in-Chrome or operator, then
  close. Until I-07 and I-09 are both closed, public launch is **No-Go**;
  **private beta** is viable.
