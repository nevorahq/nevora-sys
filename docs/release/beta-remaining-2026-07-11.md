# Beta — What's Left (2026-07-11)

**Owner:** Release owner (nevorahq@gmail.com)
**Verdict today:** **Private-Beta-Ready** — 0 P0 / 0 P1 open. Public launch stays **No-Go**.
**Related:** [`p0-p1-issue-register.md`](./p0-p1-issue-register.md) ·
[`smoke-test-checklist.md`](./smoke-test-checklist.md) ·
plan [`../project-workflows-and-beta-plan-2026-07-10.md`](../project-workflows-and-beta-plan-2026-07-10.md)

The code blockers are closed. The critical path from here is **not code — it is
proof**: prove the core loop on a deployed environment, then find out whether real
people can use it. Items are ordered by the plan's dependency chain.

**State legend:** `TODO` · `IN PROGRESS` · `DONE` · `BLOCKED` (waiting on a prior item)

---

## 🔴 Critical path — open the private beta

Everything here is human/operator work, not a code change.

### 1. Live Sentry smoke — Phase 2 tail · `TODO`

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

### 2. I-09 — interactive smoke on a deployed authed environment · `TODO`

The canonical scenarios are [`smoke-test-checklist.md`](./smoke-test-checklist.md);
this run adds the evidence contract + the A1–A3 money invariants.

- [ ] Test data: **org A** with ≥1 subscription, ≥1 document, ≥1 overdue task; and a
      **second org B** owned by a different user (isolation checks).
- [ ] Run the full checklist, ⚑ items first, one evidence block per scenario
      (recording/screenshot + `diagnosticId`↔Sentry + money SQL where relevant).
- [ ] Money invariants hold: **A1** (financial task double-click → 1 tx), **A2**
      (cycle double-click → 1 cycle + 1 tx), **A3** (plain task complete → 0 tx).
      SQL pack: [`../../scripts/db/phase-3-money-invariants.sql`](../../scripts/db/phase-3-money-invariants.sql).
- [ ] Fill [`phase-3-proof-report-TEMPLATE.md`](./phase-3-proof-report-TEMPLATE.md)
      → `phase-3-proof-report-2026-XX-XX.md`.
- [ ] Flip **I-09** `OPEN → closed with proof` in [`p0-p1-issue-register.md`](./p0-p1-issue-register.md).

> Depends on item 1 (Sentry must be live to make the `diagnosticId` column real).

### 3. Five live users — Product Proof · `TODO`

Real users on **their own** data, **no hand-holding**.

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
| **I-07** | Rotate the leaked test key (`sk_test_`, never published) | **DEFERRED** to the Paddle-production cutover — still a public-launch blocker |
| **I-11** | Run CI green on the **actual deploy commit** (not just in-PR) | CI job exists; deploy-commit run pending |
| **I-12** | Replace placeholder landing contact channels with real ones | `TODO` |
| — | Paddle paid billing: one end-to-end **sandbox** pass + a default payment link | only if the beta goes to paid (Phase 5); unit-proven, not run live |

---

## ⚪ Known debt — not blockers (tracked)

- Analytics still shows CRM metrics (`KNOWN_UNGATED_READS`) — acknowledged Phase 1 debt.
- Action Center generates signals in the render path → move out (Phase 4).
- No e2e / Playwright stack — this is Phase 4, deliberately **after** the 5 users.
- I-13(c): `storage_used_bytes` is assert-not-reserve (needs a migration).

---

## Closed recently (context)

- Phantom-paid hole on transaction delete fixed (#24).
- Phase 3 proof runbook + A1–A3 SQL pack + report template (#23).
- Netlify host correction + edge-runtime no-op decision (#25).
- Temporary Sentry smoke probe added (#26); removal queued (#27, hold until item 1).
- Legacy phantom-paid cycle on remote reconciled to `cancelled`.
- `@sentry/nextjs` wizard anomaly untangled (reverted; vendor-neutral seam kept).

---

**One line:** three operator steps stand between here and the closed beta —
Sentry smoke → I-09 → five users. Everything else is public-launch work that only
starts if the five users return ≥3/5.
