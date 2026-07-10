# Phase 3 — Proof Report — TEMPLATE

> **How to use:** copy this file to `phase-3-proof-report-<YYYY-MM-DD>.md`, fill
> every field during the run, and keep it as a snapshot (do not rewrite it after
> the tested commit moves — mirror the "do not rewrite" note in
> [`smoke-test-report-2026-07-09.md`](./smoke-test-report-2026-07-09.md)).
>
> Scenario source of truth is the canonical
> [`smoke-test-checklist.md`](./smoke-test-checklist.md); this report does **not**
> restate the steps — it records **evidence**. A scenario is closed only when its
> evidence contract is satisfied: (1) recording/screenshot of the end state,
> (2) `diagnosticId` of any error + confirmation it is visible in Sentry, and
> (3) for money scenarios, the A1–A3 SQL result proving the invariant.

**Status legend:** `PASS` (evidence recorded) · `FAIL` (issue logged, id) ·
`BLOCKED` (missing dependency) · `NOT EXECUTED` (no environment).

---

## Environment

| | |
|---|---|
| **Run date** | `<YYYY-MM-DD>` |
| **Operator** | `<name>` |
| **Commit** | `<sha>` (branch `<branch>`) |
| **Migration baseline** | `000`–`<n>` applied to remote |
| **App** | **deployed** `<url>` (NOT localhost — I-09 requires a deployed authed env) |
| **Database** | remote Supabase `<project-ref>` (service-role, SELECT for SQL pack) |
| **Auth session** | authenticated as `<test user / org A>` |
| **Second org** | `<org B, different owner>` (isolation checks) |
| **Sentry** | ☐ DSNs set on Vercel · ☐ `monitoring.initialized/provider:sentry` seen · visibility check: [`phase-3-sentry-visibility-check.md`](./phase-3-sentry-visibility-check.md) `<PASS/FAIL>` |
| **SQL pack** | [`scripts/db/phase-3-money-invariants.sql`](../../scripts/db/phase-3-money-invariants.sql) |

---

## Blockers gate (all must be ✅ before Part A starts)

- [ ] Deployed authed environment reachable (not `localhost`).
- [ ] Sentry live on this env; visibility check passed (server + client correlated).
- [ ] Test data: org A with ≥1 subscription, ≥1 document, ≥1 overdue task.
- [ ] Second org B owned by a different user.
- [ ] Remote DB access for the SQL pack.

---

## Part A — I-09 interactive smoke (evidence per scenario)

> Prioritise ⚑ items — they are release blockers. Fill one block per scenario.
> Money scenarios (A-S4, A-S5, A-S6) additionally carry an SQL-invariant row.

### A-S1 · register → onboarding → org → dashboard
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence (recording/screenshot):** `<link>`
- **Error `diagnosticId` (if any) + Sentry:** `<none / id + Sentry permalink>`
- **Notes:** `<observed end state>`

### A-S2 · upload → extract → review → confirm transaction  ⚑ (money)
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **SQL invariant:** confirmed transaction is a single live posted `money_transactions` row linked to the document. `<row / verdict>`
- **Notes:**

### A-S3 · reject document suggestion
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **SQL invariant:** rejection posts **no** `money_transactions` row (count unchanged). `<before / after / delta 0>`
- **Notes:**

### A-S4 · mark financial task paid — TWICE (double-click, then refresh + again)  ⚑ (money · A1)
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link — second attempt reports already-paid>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **SQL invariant A1** (`task_id = <…>`):

  | task_id | financial_status | financial_transaction_id | linked_tx_count | verdict |
  |---|---|---|---|---|
  | `<…>` | `<paid>` | `<uuid>` | `<1>` | `<PASS/FAIL>` |

- **Notes:**

### A-S5 · mark subscription cycle paid — TWICE  ⚑ (money · A2)
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **SQL invariant A2** (`subscription_id = <…>`, `period_key = <…>`):

  | subscription_id | billing_period_key | status | transaction_id | cycles_for_period | linked_tx_count | verdict |
  |---|---|---|---|---|---|---|
  | `<…>` | `<…>` | `<paid>` | `<uuid>` | `<1>` | `<1>` | `<PASS/FAIL>` |

  > **Use a cycle you just created in this run — not a pre-existing paid cycle.**
  > The remote already holds ≥1 **legacy paid cycle** (`status='paid'` but
  > `transaction_id IS NULL`). Its origin is traced (domain_events, 2026-07-08):
  > the cycle *was* paid through the real RPC — a transaction was created and
  > linked — and then that transaction was **hard-deleted** via
  > `deleteTransactionAction`, so the FK `transaction_id … ON DELETE SET NULL`
  > ([`078_subscription_payment_cycles.sql`](../../supabase/migrations/078_subscription_payment_cycles.sql#L90))
  > nulled the link while the cycle stayed `paid`. (The task's
  > `financial_status='open'` is expected, not an anomaly: the cycle path links
  > money on `cycle.transaction_id`, never on the task.) A2 will correctly report
  > `FAIL` on such a row — that is a stale data artifact, **not** a P0 from this
  > run. See the legacy-row note under the P0 rule below before logging it as an
  > incident.

- **Notes:**

### A-S6 · plain task complete posts no money  ⚑ (money · A3)
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **SQL invariant A3** (`org_id = <…>`): tx_count BEFORE = `<n>`, AFTER = `<n>`, **delta = 0** → `<PASS/FAIL>`
- **Notes:**

### A-S7 · cross-org direct-ID access  ⚑
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link — safe not-found, not 500, not org A's row>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **Notes:** record which record type + URL tried from org B.

### A-S8 · notification read ≠ resolve
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link — read state changes, item not resolved>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **Notes:**

### A-S9 · Capture Inbox accept / reject
- **Result:** `<PASS/FAIL/BLOCKED>`
- **Evidence:** `<link — accept routes to the right service; reject closes>`
- **Error `diagnosticId` + Sentry:** `<none / id + permalink>`
- **Notes:**

> **P0 rule:** if any of A1–A3 shows `FAIL` (a money double or a phantom
> transaction) **on a row this run produced**, stop Phase 3, log it as a P0
> incident, fix, and re-run. A money double is an incident, not a listed bug.
>
> **Legacy-row caveat (traced on remote 2026-07-10):** an A1/A2 `FAIL` on a row
> that existed *before* this run may be a stale data artifact, not a live-code
> defect. Known example: a paid `subscription_payment_cycles` row with
> `transaction_id IS NULL`. Origin (domain_events): the cycle was paid via the
> real RPC, then its transaction was **hard-deleted** by `deleteTransactionAction`
> — the `ON DELETE SET NULL` FK nulled the link while the cycle stayed `paid`.
> The underlying code gap (delete now refuses when the transaction backs a paid
> cycle or financial task) was **fixed in #24**; it was **not** a fault of the
> mark-paid flow. New phantom-paid rows can no longer be produced this way; a
> pre-existing one may still surface. Before declaring P0: confirm the failing
> row was created **during this smoke** (check `paid_at` / `created_at` against
> the run). If it is pre-existing, record it as a **data cleanup** item (not a
> Phase 3 blocker) and re-run the scenario on a freshly created row.

### Part A summary

| Scenario | Result | Evidence | diagnosticId↔Sentry | SQL invariant |
|---|---|---|---|---|
| A-S1 register→dashboard | | | | n/a |
| A-S2 upload→confirm tx ⚑ | | | | |
| A-S3 reject suggestion | | | | Δ0 |
| A-S4 financial task ×2 ⚑ | | | | A1 |
| A-S5 sub cycle ×2 ⚑ | | | | A2 |
| A-S6 plain task complete ⚑ | | | | A3 |
| A-S7 cross-org direct-ID ⚑ | | | | n/a |
| A-S8 read ≠ resolve | | | | n/a |
| A-S9 Capture Inbox | | | | n/a |

---

## Part B — five live users (Product Proof)

Real users on **their own** data, **no hand-holding**. Note where each got stuck,
what they re-asked, where they went wrong.

| User | Upload real receipt/invoice → confirm/reject | Add real subscription → sees next payment action | Mark real payment paid → one expense, no double | Jot a "messy" note → accepts AI suggestion | Open Action Center next day → knows what to do | Passed without hints? | What broke the flow |
|---|---|---|---|---|---|---|---|
| U1 | | | | | | ☐ | |
| U2 | | | | | | ☐ | |
| U3 | | | | | | ☐ | |
| U4 | | | | | | ☐ | |
| U5 | | | | | | ☐ | |

**Passed without hints (of 5):** `<n>`

> **Stop rule:** if **fewer than 3 of 5** pass **without hints**, stop feature
> development and fix onboarding / copy / workflow clarity. **Phase 4 and Phase 5
> do not begin.** This is a correct outcome, not a failure — it saves Phase 4–5.

---

## Phase 3 exit criteria

- [ ] **I-09** run once on the deployed env; every scenario has evidence per the
      contract; **all three** money invariants A1–A3 hold.
- [ ] I-09 flipped `OPEN → closed with proof` in
      [`p0-p1-issue-register.md`](./p0-p1-issue-register.md).
- [ ] **≥3 of 5** live users passed the Product Proof table without hints.

**Verdict:** `<Phase 3 CLOSED / NOT CLOSED — next step: … >`

> If not closed because of users: the next step is **not code** — it is
> onboarding / copy / workflow. Record the specific flow-breakers above and route
> them, not new features.
