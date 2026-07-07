# Roadmap Comparison Input — Nevora Business OS

**Date:** 2026-07-05
**Purpose:** structured, evidence-backed data for re-comparing the codebase
against `NEVORA_BUSINESS_OS_CONSOLIDATED_ROADMAP_2026-07-05 (1).md`.
No roadmap changes made — this is input only.

---

## 1. Phase-by-Phase Actual Status

| Phase | Roadmap Expected | Actual Codebase State | Evidence | Gaps | Recommended Roadmap Update |
|---|---|---|---|---|---|
| Phase 7 — Production Hardening & Release | Release Candidate (code complete, operational closure pending) | **partially_completed** — code green (mig 076/077 applied, RLS, atomic usage, seat trigger); operational closure NOT done | `docs/release/phase-7-release-checklist.md`; audits in `docs/audits/phase-7-*` | No Operations Manual, no runbooks, no smoke report, no beta report | Keep as Release Candidate; enumerate the 4 missing operational artifacts as explicit open blockers |
| Phase 8 — Operations Documentation | P0, full docs set | **not_started / partially** — only `contracts/domain-events.md` + root `NOTIFICATION_POLICY.md`; observability doc exists | `docs/` tree | `runbooks/` (8), `OPERATIONS_MANUAL.md`, `contracts/notification-lifecycle.md`, `contracts/financial-workflows.md` missing | Mark as the current top-priority open phase; note NOTIFICATION_POLICY.md should move to `contracts/notification-lifecycle.md` |
| Phase 9 — Notification & Action Center Lifecycle | P0 | **mostly_completed** — delivery vs business state separated; `mark all read` = read-only; idempotency; counters documented | `notification-read.actions.ts`, `counters.test.ts:5`, `NOTIFICATION_POLICY.md`, mig 073–075/082–085 | Contract not in `docs/contracts/`; some required test cases (snooze return, disabled-category-keeps-critical) not individually verified in this audit | Downgrade priority; mark near-complete, pending contract relocation + test-case audit |
| Phase 10.1 — Manual Currency Rates | Planned (P1) | **partially / designed_not_implemented (UI)** — DB + FX read layer only | mig 049/050; `get-money-summary.ts` FX read; **no** Settings UI/action/widget | Rate entry, role-guarded management, widget, audit trail | Reclassify from "Planned" to "Foundation present, user-facing part not built" |
| Phase 10.2 — Subscription Payment Workflow | Designed | **completed** — atomic idempotent RPC, cycles, tasks, mark-as-paid, next-cycle | `mark-subscription-payment-as-paid.ts`, mig 078, `subtracker/services/*`, tests | Verify mig 078 applied on remote (memory: created, not applied) | Move Designed → Implemented (pending remote-migration confirmation) |
| Phase 10.3 — Financial Context Tasks | Designed | **completed / mostly_completed** — financial tasks view, obligation detection, keys | route `tasks/financial`, `detect-financial-obligation`, `financial-task-keys`, mig 079 | Verify mig 079 applied on remote | Move Designed → Implemented (pending remote-migration confirmation) |
| Phase 11 — Capture Inbox Layer | Designed (P2) | **mostly_completed** — inbox route, planner module, suggestion schema, action-item mapping | `modules/planner/*`, route `dashboard/inbox`, mig 080 | Full acceptance criteria audit (files org-scoped, no auto-posting) not exhaustively verified here | Move Designed → Implemented; run DoD checklist |
| Phase 12 — Automation Reliability & Observability | P2 | **partially_completed** — logging, automation logs, crons, fail-closed cron auth | `docs/observability/logging-and-errors.md`, `modules/automation/*`, `vercel.json` crons | No async queue/dead-letter, **no usage-counter reconciliation job**, no SLOs, no cron history UI | Keep open; call out reconciliation job as a discrete deliverable |
| Phase 13 — CRM / Booking Reactivation Gate | Gated, not started | **not_started (correctly)** but paused code is **not fully quarantined** | relations exclude paused kinds (`relation.constants.test.ts:15`); **but** `dashboard/crm`, `dashboard/booking`, public `booking/*` routes live | Route-level gate/removal not enforced | Add explicit pre-reactivation task: gate or remove live paused routes |

---

## 2. Invariant Compliance Summary

| Invariant | Status | Key evidence |
|---|---|---|
| 3.1 Financial truth | **COMPLIANT** | drafts `planned`; explicit confirm; no-tx-on-subscription test; idempotent mark-as-paid |
| 3.2 Subscription attachment flow | **COMPLIANT** | `create-subscription-document-with-attachments.ts:32` money-free; sub-doc API route has no tx |
| 3.3 AI governance | **COMPLIANT** | `review-ai-suggestion.action.ts` categorize-only, `data.write` gated, no posting/plan-change/delete by AI |
| 3.4 Notification lifecycle | **COMPLIANT** | `mark_all_visible_notifications_read` read-only; delivery vs obligation counters separate; `NOTIFICATION_POLICY.md` |
| 3.5 Multi-tenancy | **MOSTLY COMPLIANT** | server-side org resolution + tests; RLS; service role only in background jobs; gap: no cross-org not-found unit test |

---

## 3. Release Blockers (Phase 7.13)

| Blocker | Evidence found? | State | Required action |
|---|---|---|---|
| Backfill orgs w/o `billing_subscriptions` + reconcile = 0 | Query documented, no run evidence | unknown | Run reconciliation, capture result |
| Verify production env vars | Checklist §1 | pending | Verify in Vercel Production |
| Verify `CRON_SECRET` | Enforced in all 5 cron routes (fail-closed) | code-ready | Confirm value set in prod |
| Document extraction mock off in prod | `DOCUMENT_EXTRACTION_MOCK` documented | pending | Confirm unset/false in prod |
| Review & merge Phase 7 PR | On branch per memory | pending | Merge |
| Production smoke test report | Checklist only, no report | **missing** | Execute + record |
| Controlled beta report | Launch plan only, no report | **missing** | Execute + record |
| No open P0/P1 | Not tracked in repo | unknown | Establish issue register |
| Accepted P2 documented | Not found | missing | Document |
| Release + rollback checklists | Release checklist ✔, rollback plan ✔ | partial | Add smoke-test-checklist |
| Operations Manual published | `OPERATIONS_MANUAL.md` absent | **missing** | Author |
| Incident/billing/data/release ownership | Not found in repo | missing | Assign + document |

---

## 4. Documentation Gaps (Phase 8 target vs repo)

| Document | Exists? | Notes |
|---|---|---|
| `docs/ROADMAP.md` | Yes | 211 lines; predates consolidated roadmap — verify it references the 2026-07-05 source of truth |
| `docs/MODULE_STATUS.md` | Yes | dated 2026-06-30; predates 078–086 work — outdated |
| `docs/ARCHITECTURE.md` | Yes | present |
| `docs/OPERATIONS_MANUAL.md` | **No** | missing |
| `docs/contracts/domain-events.md` | Yes | present |
| `docs/contracts/notification-lifecycle.md` | **No** | content exists in root `NOTIFICATION_POLICY.md` — relocate/duplicate |
| `docs/contracts/financial-workflows.md` | **No** | missing (financial-truth flows undocumented as contract) |
| `docs/runbooks/*` (8 files) | **No** | entire directory missing |
| `docs/release/release-checklist.md` | Partial | exists as `phase-7-release-checklist.md` (pinned at mig 077, stale) |
| `docs/release/rollback-plan.md` | Partial | exists as `phase-7-rollback-plan.md` |
| `docs/release/smoke-test-checklist.md` | **No** | closest is `phase-7-regression-and-gates.md` |

---

## 5. Test Gaps (critical roadmap cases)

| Required test | Present? | Evidence |
|---|---|---|
| No transaction on subscription creation | **Yes** | `create-subscription.action.test.ts:88` |
| No transaction on document attachment | Partial | service asserts money-free in code/comment + dedicated service test file exists; no explicit "never posts" assertion audited |
| Mark all read does not resolve action item | Partial | `counters.test.ts:5` separates counters; no end-to-end "obligation survives mark-all-read" test found |
| Wrong-org detail page → safe not-found | **No** | no cross-org not-found unit test; RLS + `.eq(org_id)` only |
| Usage reservation prevents concurrent overshoot | Partial | `phase6-billing.test.ts`, `account-limits.test.ts` exist; concurrency race not explicitly simulated |
| AI cannot post transaction without approval | **Yes (indirect)** | `review-ai-suggestion.action.test.ts` + no insert path in AI actions |
| Paused modules not in active nav/relations | **Yes** | `relation.constants.test.ts:15` rejects paused kinds; sidebar has no CRM, Booking commented |

---

## 6. Navigation / Scope Mismatches

| Item | Finding | Evidence | Risk |
|---|---|---|---|
| CRM route | Live & renders data, hidden from nav only | `dashboard/crm/page.tsx` | Reachable by URL in release |
| Booking dashboard route | Live, nav entry commented | `dashboard/booking/page.tsx`, `sidebar.tsx:58` | Reachable by URL |
| Public booking | Public route gated by `public_enabled` | `booking/[organizationSlug]/page.tsx` | Live if any org enabled it |
| Landing pricing | Lists CRM/Deals/Clients as paid quotas | `landing-content.ts` (multiple lines) | Sells paused features |
| Relations metadata | Correctly excludes paused kinds | `relation.constants.ts` + test | Compliant |

---

## 7. Recommended Roadmap Corrections (facts only)

1. Phase 10.2, 10.3, 11 and Trial Abuse Guard are **implemented in code**, not merely "Designed" (migrations 078–080, 086 present). Confirm remote-apply state before flipping status.
2. Phase 7 remains a Release Candidate; the true remaining work is **operational (Phase 8) documentation + smoke/beta reports**, not code.
3. Phase 10.1 has a **DB/read foundation** (base currency + `exchange_rates` + `fn_get_exchange_rate`) but **no user-facing management** — split its status accordingly.
4. Phase 13 gate should include an explicit task to **gate or remove live `crm`/`booking` routes** and **correct landing pricing copy**, since paused code is not currently quarantined at the route/marketing layer.
