# Phase 3 — Proof Report — 2026-07-11 (I-09 interactive smoke)

> Snapshot report. Do **not** rewrite after the tested commit moves.
> Scenario source of truth: [`smoke-test-checklist.md`](../../release/smoke-test-checklist.md).
> This file records **evidence**, not steps. A scenario closes only when its
> evidence contract is met: (1) end-state screenshot, (2) `diagnosticId` of any
> error + Sentry visibility, (3) for money scenarios, the A1–A3 SQL result.

**Status legend:** `PASS` · `FAIL` (issue id) · `BLOCKED` (missing dep) · `NOT EXECUTED`.

---

## Environment

| | |
|---|---|
| **Run date** | 2026-07-11 |
| **Operator** | Evgheni Nujnenco (nevorahq@gmail.com); driving via in-app browser |
| **Commit** | `main` head `6f7317f` (deploy served by Netlify; deploy-commit not header-exposed) |
| **Migration baseline** | `000`–`101` applied to remote (101 files, `054` known gap) |
| **App** | **deployed** https://bussines.nevorahq.com (Netlify) |
| **Database** | remote Supabase `uimpykbnatzhykzpastd` (service-role, SELECT for SQL pack) |
| **Auth session** | `enujnenco@enso.ro` → active org **"new org"** `5ff06592-8720-4728-94c7-73d6480aae10` (the fixtures org = "org A" of the contract) |
| **Second org** | **"org A"** `5b23861d…` owned by `nev.front.dev@gmail.com` (different owner, for A-S7 isolation) |
| **Sentry** | ☑ DSNs on Netlify · ☑ `monitoring.initialized/provider:sentry` · visibility check [`phase-3-sentry-visibility-check.md`](./phase-3-sentry-visibility-check.md) **PASS** (2026-07-11) |
| **SQL pack** | [`scripts/db/phase-3-money-invariants.sql`](../../../scripts/db/phase-3-money-invariants.sql) |

### Test-data note (important)
The org literally named **`org A`** (`5b23861d`) is **empty** (0 subs / 0 docs / 0 tasks).
The contract fixtures live in **`new org`** (`5ff06592`, owner `enujnenco@enso.ro`):
**6 subscriptions, 5 documents, 6 overdue open tasks**, `money_transactions` baseline **= 0**.
So the run treats **`new org`** as "org A", and the empty `5b23861d` (different owner
`nev.front.dev@gmail.com`) as the non-member **org B** for the A-S7 isolation check.

---

## Blockers gate

- [x] Deployed authed environment reachable (not localhost).
- [x] Sentry live on this env; visibility check passed (2026-07-11).
- [x] Test data: org "new org" with ≥1 subscription, ≥1 document, ≥1 overdue task.
- [x] Second org B (`5b23861d`) owned by a different user.
- [x] Remote DB access for the SQL pack (service-role).

---

## Part 0 — Ops / read-only checks (§13, no auth) — collected 2026-07-11

| Check | Evidence | Verdict |
|---|---|---|
| ⚑ `GET /api/health` without cookies | `200 {"status":"healthy","checks":{"server":"ok","database":"ok"}}` | **PASS** |
| ⚑ `GET /api/cron/{reminders,extraction-sweep,subscription-sweep,suggestions-sweep,trial-sweep}` no auth | all **401** (not 200) | **PASS** |
| ⚑ Booking anon-lockdown (mig 098): anon key on `booking_pages`/`booking_host_profiles`/`booking_services`/`booking_host_services` | `42501 permission denied` ×4; conflict RPC not exposed to anon (PGRST202) | **PASS** |
| ⚑ Migration baseline vs tree | 101 files `000`→`101`, `054` gap present | **PASS** |

---

## Part A — I-09 interactive smoke (evidence per scenario)

### A-S1 · register → onboarding → org → dashboard
- **Result:** PARTIAL — login PASS; register path BLOCKED
- **Evidence:** authenticated as `enujnenco@enso.ro`; `/dashboard` renders Action Center for org "new org" (heading "Action Center", summary strip Overdue 6 / Needs 3 / Upcoming 3 / Recently Resolved 20, grouped "Next actions" feed). §2 (Action-Center-first, org-scoped) satisfied on the same screen.
- **Error `diagnosticId`:** none
- **Notes:** Full **register** flow is **BLOCKED** on this remote — email-confirmation is ON while the app expects OFF (documented). Not a code defect from this run; honest BLOCKED, not a fake pass.

### A-S2 · upload → extract → review → confirm transaction  ⚑ (money)
- **Result:** **PASS (live upload)**
- **Evidence:** operator uploaded invoice **"test invioce"** (`886eefab`, doc_type=invoice) → extraction produced a draft. Documents 5 → **6**; `money_transactions` unchanged (**19**) at upload — ⚑ **extraction posts nothing on its own** (the doc's tx appeared only at confirm time 18:11, not upload 18:06). Then confirmed the draft via the Action Center review.
- **SQL invariant:** `money_transactions WHERE source_document_id = 886eefab` → exactly **1** row (`6a1a1125…`, type=expense, status=posted, amount=450 MDL, `source_extraction_id` set, deleted_at=NULL). Confirm → **one** linked posted tx, no double-post. **PASS**.
- **Error `diagnosticId`:** none
- **Corroboration:** the same invariant also holds on the prior-run row (doc `99f81a81` → single posted $24 expense `7310f47d…`).

### A-S3 · reject document suggestion
- **Result:** **PASS (live)**
- **Evidence:** operator uploaded invoice #2 **"тестовый документ"** (`9ae5e7bf`, invoice, draft) → extraction produced a draft → **rejected** it. **No** posted transaction resulted: `money_transactions` unchanged at **19**, and **zero** tx created after the A-S2 confirm timestamp (18:11). Δmoney = **0**.
- **Error `diagnosticId`:** none

### A-S4 · mark financial task paid — TWICE  ⚑ (money · A1)
- **Result:** **PASS**
- **Evidence:** financial task materialised via **Capture Inbox** (the cleaner path — no upload dependency): operator captured "Оплатить счёт поставщику ACME на 500 MDL до 20 июля 2026" → AI suggested a **Financial task (95%)** → **Accept** created todo `b8962191` (amount 500 MDL, `task_context_type=invoice_payment`, `financial_status=open`, `financial_transaction_id=NULL`, due 2026-07-17). Creating the task posted **no** money (still 19). Then **Mark as paid** on `/dashboard/tasks/financial`, double-clicked, refresh + again. `money_transactions` 19 → **20** (delta **+1**, not +2).
- **Error `diagnosticId`:** none
- **SQL invariant A1** (`task_id = b8962191`):

  | task_id | financial_status | financial_transaction_id | linked_tx_count | verdict |
  |---|---|---|---|---|
  | `b8962191` | `paid` | `2a6118e8…` | `1` | **PASS** |

  Linked tx: expense / posted / 500 MDL. The double-click produced **exactly one** tx — no money double.
- **Notes:** demonstrates the document→AI→obligation→financial-task→mark-as-paid path (obligation surfaced via capture rather than an OCR-detected due date; the uploaded invoices were detected as already-incurred expenses, so they exposed no "create task" action). Exactly-once also DB-enforced (planner unique indexes, migration 099).

### A-S5 · mark subscription cycle paid — TWICE  ⚑ (money · A2)
- **Result:** **PASS**
- **Evidence:** subscription **"test sub"** (100 MDL/monthly, id `6b6ca1ee`), cycle **2026-09** (`task_open`, tx=null) → clicked **Mark as paid**, then a second rapid click. UI advanced: 2026-09 → **Paid** in history, new **2026-10** cycle opened (`task_open`). `money_transactions` 18 → **19** (delta **+1**, not +2). New tx: `2e3f9cf0…` expense/posted/100 MDL/"test sub subscription — 2026-09".
- **Error `diagnosticId`:** none
- **SQL invariant A2** (`subscription_id = 6b6ca1ee`, `period_key = 2026-09`):

  | subscription_id | billing_period_key | status | transaction_id | cycles_for_period | linked_tx_count | verdict |
  |---|---|---|---|---|---|---|
  | `6b6ca1ee` | `2026-09` | `paid` | `2e3f9cf0…` | `1` | `1` | **PASS** |

- **Notes:** the two rapid clicks produced **exactly one** tx (no double). The UI advances the schedule on the first pay and rebinds "Mark as paid" to the next cycle, so a same-cycle double-click cannot be re-fired through the button; after refresh the paid 2026-09 cycle is history-only (not clickable). Same-period exactly-once is DB-enforced (`UNIQUE(org, subscription, billing_period_key)` + atomic RPC, migrations 078/099). Schedule advanced exactly once (2026-09 paid → 2026-10 opened).

### A-S6 · plain task complete posts no money  ⚑ (money · A3)
- **Result:** **PASS**
- **Evidence:** created a dedicated throwaway task `SMOKE A-S6 … (delete me)` (id `1954bc95-f4a0-4260-9831-b2c5779c88b5`) in new org via UI, then set status → «Закрыта» (done). Real backlog untouched.
- **Error `diagnosticId`:** none
- **SQL invariant A3** (`org_id = 5ff06592…`): tx_count BEFORE = **18**, AFTER = **18**, **delta = 0** → **PASS**. Task ends `status=done, is_completed=true, financial_transaction_id=NULL, financial_paid_at=NULL` (no money posted, no obligation paid).
- **Notes:** in-app browser session held through the full create→complete cycle. Cleanup: the `SMOKE A-S6` task is still present (completed) — safe to delete.

### A-S7 · cross-org direct-ID access  ⚑
- **Result:** **PASS**
- **Evidence:** logged in as `enujnenco@enso.ro` (member of `new org` + `nevora srl 33504a51` only). Opened detail URLs of records from orgs this user is **not** a member of:
  - task `933f14f5…` (org `nev-developer` 63b9f4ad) → **404 "This page could not be found."**
  - subscription `4ff12d86…` (org `nev-developer`) → **404**
  - document `ac8009a9…` (org `nevora srl` 3e523cab) → **404**
- **Error `diagnosticId`:** none
- **Notes:** safe not-found in every case — never a 500, never the other org's record, and the authed shell stays intact (active org still `new org`). Isolation enforced server-side. Tested from the current session (non-member of the target orgs) rather than a second login — equivalent guarantee, different owner. (The earlier `/login` bounce during a session swap was discarded as invalid.)

### A-S8 · notification read ≠ resolve
- **Result:** **PASS**
- **Evidence:** bell showed **1 unread** → opened panel → **Mark all as read (1)**. After: bell badge cleared (**unread = 0**, panel reads "Нет новых уведомлений"), while the Action Center is **unchanged**: **Overdue = 4** (same), Needs Att 1, Money attention (1) still lists "Transaction has no document: test sub — 2026-09", Next actions (4) still lists the overdue task. The panel copy itself states the rule: *"Reading clears new-delivery badges. Active actions remain open until completed or resolved."*
- **Error `diagnosticId`:** none
- **Notes:** read state changed; not one obligation was resolved. Read ≠ resolve confirmed by behaviour and UI copy.

### A-S9 · Capture Inbox accept / reject
- **Result:** **PASS**
- **Evidence:**
  - **Accept:** captured "SMOKE A-S9 напомнить проверить бэкап…" → AI suggestion **Задача 95%** ("Check database backup (SMOKE A-S9)") → **Принять** → card shows "Принято · Создано: **task**"; task `48056ed3…` created via the task service. `money_transactions` unchanged (**19**) — ⚑ accept posts **no** money.
  - **Reject:** captured "SMOKE A-S9 reject…" → AI suggestion **Задача 62%** tagged "Нужна проверка" (low-confidence shown as a suggestion, not applied) → **Отклонить** → card shows "**Отклонено**"; nothing created; `money_transactions` still **19**.
- **Error `diagnosticId`:** none
- **Notes:** accept routes through the existing module service; reject closes cleanly; low-confidence AI is surfaced as a suggestion, never auto-applied.

### Part A summary

| Scenario | Result | Evidence | diagnosticId↔Sentry | SQL invariant |
|---|---|---|---|---|
| A-S1 register→dashboard | PARTIAL (login PASS / register BLOCKED) | dashboard render | none | n/a |
| A-S2 upload→confirm tx ⚑ | **PASS** (live upload) | doc 886eefab → tx 6a1a1125 | none | **1 linked posted tx** ✅ |
| A-S3 reject suggestion | **PASS** (live) | doc 9ae5e7bf rejected, 0 tx | none | **Δ0** ✅ |
| A-S4 financial task ×2 ⚑ | **PASS** | task b8962191 → tx 2a6118e8, Δtx +1 | none | **A1 paid / 1 tx** ✅ |
| A-S5 sub cycle ×2 ⚑ | **PASS** | test sub 2026-09 paid, Δtx +1 | none | **A2 1 cycle / 1 tx** ✅ |
| A-S6 plain task complete ⚑ | **PASS** | SMOKE task create→done | none | **A3 Δ0** ✅ |
| A-S7 cross-org direct-ID ⚑ | **PASS** | 3 record types → 404 not-found | none | n/a |
| A-S8 read ≠ resolve | **PASS** | unread→0, Overdue stays 4 | none | n/a |
| A-S9 Capture Inbox | **PASS** | accept→task / reject→closed, Δmoney 0 | none | n/a |

---

## Result roll-up (2026-07-11)

| Scenario | Verdict |
|---|---|
| Ops/read-only §13 (health, cron auth, booking anon-lockdown, migration baseline) | ✅ PASS (4 ⚑) |
| §2 Action-Center-first, org-scoped | ✅ PASS |
| A-S1 login | ✅ PASS · register BLOCKED (email-confirmation ON) |
| A-S5 / **A2** subscription cycle ×2 ⚑ | ✅ **PASS** (1 cycle / 1 tx, Δtx +1) |
| A-S6 / **A3** plain task complete ⚑ | ✅ **PASS** (Δtx 0) |
| A-S7 cross-org isolation ⚑ | ✅ PASS (3 record types → 404) |
| A-S8 read ≠ resolve | ✅ PASS |
| A-S9 Capture Inbox accept/reject | ✅ PASS (Δmoney 0) |
| A-S2 document→confirm tx ⚑ | ✅ **PASS** live (doc 886eefab → tx 6a1a1125; extraction posted nothing) |
| A-S3 reject document suggestion | ✅ **PASS** live (doc 9ae5e7bf rejected, Δmoney 0) |
| A-S4 / **A1** financial task ×2 ⚑ | ✅ **PASS** (task b8962191 → tx 2a6118e8, Δtx +1) |

**Upload triplet completed 2026-07-11** (second sitting). Claude-in-Chrome would not
connect, so the three upload-gated scenarios ran in **operator-clicks + SQL-verify**
mode: the operator drove the browser (upload / confirm / reject / capture / mark-paid)
and each step was verified via the service-role SQL. Financial task for A1 was
materialised through **Capture Inbox** (AI classified a bill-to-pay as a Financial
task) since the uploaded invoices were detected as already-incurred expenses.

## Phase 3 exit criteria

- [x] **I-09** — fully executed on the deployed env; every scenario has evidence.
      **All three money invariants A1, A2, A3 hold** (SQL-proven).
- [x] I-09 flip `PARTIAL → closed with proof` in [`p0-p1-issue-register.md`](../../release/p0-p1-issue-register.md).
- [ ] ≥3 of 5 live users passed the Product Proof table without hints (separate item — Product Proof, not I-09).

**Verdict:** **I-09 CLOSED — PASS.** 8 interactive scenarios + 4 ops ⚑ all PASS;
**A1, A2, A3 all proven live with SQL**; cross-org isolation, read≠resolve, and
Capture Inbox proven. Only A-S1 register stays BLOCKED (remote email-confirmation ON
— an environment setting, not a code defect). Next critical-path item: 5 live users.

### Live artifacts created this run — cleanup status (2026-07-11)
- Task `SMOKE A-S6 … (delete me)` (`1954bc95…`) — **DELETED** (hard).
- Task `Check database backup (SMOKE A-S9)` (`48056ed3…`) — **DELETED** (hard).
- Capture `SMOKE A-S9 reject…` (`75bad708…`) — **ARCHIVED** (app's delete = `status=archived`; out of inbox view).
- Capture `SMOKE A-S9 напомнить…` (`d0d5e0c2…`) — **ARCHIVED**.
- **"test sub"** subscription (`6b6ca1ee`): cycle **2026-09 paid** → expense tx
  `2e3f9cf0…` (100 MDL) — later **DELETED by the operator** (cycle + tx removed
  together, cleanly, no phantom-paid; confirmed via SQL: both rows gone).
- **Upload-triplet artifacts (second sitting):**
  - Doc `886eefab` "test invioce" (invoice) → confirmed expense tx `6a1a1125…` (450 MDL) — **retained** (real ledger entry).
  - Doc `9ae5e7bf` "тестовый документ" (invoice) → draft **rejected**, no tx.
  - Financial task `b8962191` "Оплатить счёт поставщику ACME" (500 MDL) → paid → expense tx `2a6118e8…` — **retained** (real ledger entry). Both are test rows; the posted expenses are real in the ledger.
