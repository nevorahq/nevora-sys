# Beta — What's Left (2026-07-11)

**Owner:** Release owner (nevorahq@gmail.com)
**Verdict today:** **Private-Beta-Ready** — 0 P0 / 0 P1 open. Sentry smoke and
**I-09 both CLOSED (PASS) 2026-07-11** — the only remaining critical-path item before
the closed beta is **5 live users**. Public launch stays **No-Go** (I-07 outstanding).

**Update 2026-07-11 (later):** critical-path items 1 (Sentry) and 2 (I-09) are now
**DONE**. See [`phase-3-proof-report-2026-07-11.md`](./phase-3-proof-report-2026-07-11.md)
(I-09, PRs #31/#32) and [`phase-3-sentry-visibility-check.md`](./phase-3-sentry-visibility-check.md).

**Update 2026-07-12:** the paid-billing flip that follows the 5-user signal now has a
code-grounded runbook — [`paid-beta-cutover-checklist.md`](./paid-beta-cutover-checklist.md)
(PR #40). It gates the `private_beta → paid_beta` flip on ≥3/5 users, and folds in the
public-launch blockers (I-07/I-11/I-12) plus the live Paddle sandbox pass. Nothing on the
critical path changed — **5 live users is still the only remaining step**.

**Related:** [`p0-p1-issue-register.md`](./p0-p1-issue-register.md) ·
[`paid-beta-cutover-checklist.md`](./paid-beta-cutover-checklist.md) ·
[`smoke-test-checklist.md`](./smoke-test-checklist.md) ·
plan [`../project-workflows-and-beta-plan-2026-07-10.md`](../project-workflows-and-beta-plan-2026-07-10.md)

The code blockers are closed. The critical path from here is **not code — it is
proof**: prove the core loop on a deployed environment, then find out whether real
people can use it. Items are ordered by the plan's dependency chain.

**State legend:** `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` (waiting on a prior item)

---

## 🔴 Critical path — open the private beta

Everything here is human/operator work, not a code change.

### 1. Live Sentry smoke — Phase 2 tail · `DONE` ✅ (2026-07-11)

All lanes PASS (server caught + uncaught + client), recorded in
[`phase-3-sentry-visibility-check.md`](./phase-3-sentry-visibility-check.md); probe
removed (#27). Original checklist kept below for the record.

Without this the `diagnosticId` evidence in I-09 has nothing to correlate against.

- [ ] Confirm DSNs are picked up on the deployed env: Netlify → Logs → Functions
      shows `{"event":"monitoring.initialized","provider":"sentry"}` (not `noop`).
- [ ] Server lane: `curl -H "Authorization: Bearer $METRICS_SECRET" https://<host>/api/internal/diag-sentry`
      → take `diagnosticId` from the response → find the event in Sentry (tag `event=diag.sentry.smoke`).
- [ ] Uncaught lane: same URL `?mode=throw` → find the `digest` in the Netlify
      function log → match it in Sentry (`next.request.error`).
- [ ] Client lane: on the deployed site, DevTools console
      `setTimeout(() => { throw new Error("diag: client " + Date.now()) })` → confirm a browser event.
- [ ] Record all lanes in [`phase-3-sentry-visibility-check.md`](./phase-3-sentry-visibility-check.md).
- [ ] **Merge PR #27** (removes the temporary `/api/internal/diag-sentry` probe) — only after the above passes.

> If smoking a **deploy preview** rather than production, make sure the Sentry DSNs
> are set for the Deploy-preview context in Netlify, not Production-only.

### 2. I-09 — interactive smoke on a deployed authed environment · `DONE` ✅ (2026-07-11)

**CLOSED — PASS.** Ran on deployed `bussines.nevorahq.com`; all 8 scenarios + 4 ops ⚑
green, and **all three money invariants A1, A2, A3 proven live** with SQL. Proof:
[`phase-3-proof-report-2026-07-11.md`](./phase-3-proof-report-2026-07-11.md) (PRs #31/#32).

- [x] Test data: org **"new org"** (`5ff06592`, owner `enujnenco@enso.ro`) with subs/docs/overdue tasks; non-member orgs used for isolation.
- [x] Full checklist run with per-scenario evidence + money SQL.
- [x] Money invariants: **A1** (financial task `b8962191` → tx `2a6118e8`, ×2 → 1 tx), **A2** (cycle `6b6ca1ee`/2026-09 → 1 cycle + 1 tx), **A3** (plain task → Δtx 0). All PASS.
- [x] Proof report filled → `phase-3-proof-report-2026-07-11.md`.
- [x] **I-09 flipped `OPEN → CLOSED with proof`** in [`p0-p1-issue-register.md`](./p0-p1-issue-register.md).

> Notes: upload triplet (A-S2/A-S3/A-S4·A1) finished in **operator-clicks + SQL-verify**
> mode (Claude-in-Chrome would not connect); the A1 financial task was materialised via
> **Capture Inbox** (uploaded invoices were detected as already-incurred expenses). Only
> **A-S1 register** stays BLOCKED = remote email-confirmation ON (env setting, not a defect).

### 3. Five live users — Product Proof · `TODO` ← **the only remaining critical-path item**

Real users on **their own** data, **no hand-holding**. With items 1 and 2 closed,
this is the last thing standing between here and the open closed-beta.

- [ ] Each of 5 users runs the Product Proof table (upload receipt → confirm/reject;
      add subscription → sees next payment; mark payment paid → one expense, no double;
      jot a messy note → accepts AI suggestion; open Action Center next day → knows what to do).
- [ ] Record pass/fail per row + one "what broke the flow" note per user.

> **⚑ Stop rule (the only thing that can reverse the roadmap):** if **fewer than 3
> of 5** pass **without hints**, stop feature development and fix
> onboarding / copy / workflow clarity. **Phase 4 and Phase 5 do not begin.** A
> failing result is the correct, cheap outcome — it saves Phase 4–5.

---

## 🟠 Public-launch blockers (after the beta signal — not required for the closed beta)

| ID | Item | State |
|---|---|---|
| **I-07** | Rotate the leaked test key (`sk_test_`, never published) | **DEFERRED** to the Paddle-production cutover — still a public-launch blocker ([cutover §5](./paid-beta-cutover-checklist.md)) |
| **I-11** | Run CI green on the **actual deploy commit** (not just in-PR) | CI job exists; deploy-commit run pending ([cutover §5](./paid-beta-cutover-checklist.md)) |
| **I-12** | Replace placeholder landing contact channels with real ones | `TODO` ([cutover §5](./paid-beta-cutover-checklist.md)) |
| — | Paddle paid billing: one end-to-end **sandbox** pass + a default payment link | only if the beta goes to paid (Phase 5); unit-proven, not run live — full runbook in [`paid-beta-cutover-checklist.md`](./paid-beta-cutover-checklist.md) |

---

## ⚪ Known debt — not blockers (tracked)

- Analytics still shows CRM metrics (`KNOWN_UNGATED_READS`) — acknowledged Phase 1 debt.
- Action Center generates signals in the render path → move out (Phase 4).
- No e2e / Playwright stack — this is Phase 4, deliberately **after** the 5 users.
- I-13(c): `storage_used_bytes` is assert-not-reserve (needs a migration).

---

## Closed recently (context)

- **Live Sentry smoke — PASS (#30); I-09 interactive smoke — CLOSED, PASS (#31/#32), 2026-07-11.** All money invariants A1/A2/A3 proven live.
- Phantom-paid hole on transaction delete fixed (#24).
- Phase 3 proof runbook + A1–A3 SQL pack + report template (#23).
- Netlify host correction + edge-runtime no-op decision (#25).
- Temporary Sentry smoke probe added (#26); removal queued (#27, hold until item 1).
- Legacy phantom-paid cycle on remote reconciled to `cancelled`.
- `@sentry/nextjs` wizard anomaly untangled (reverted; vendor-neutral seam kept).

---

**One line:** Sentry smoke ✅ and I-09 ✅ are closed (2026-07-11) — **one operator
step stands between here and the closed beta: five live users.** Everything else is
public-launch work (I-07/I-11/I-12) that only starts if the five users return ≥3/5.
