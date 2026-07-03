# Phase 7.6 — Performance & Scalability Audit

**Status:** Draft 1 — hot-path review complete
**Date:** 2026-07-02
**Codebase:** `main`, migrations through `077`
**Scope:** Phase 7 plan §7.6 — dashboard + core list/detail/relation pages under a
realistic dataset (≈500 tasks, 500 transactions, 100 documents, 25 subscriptions,
300 links, 100 events).

---

## 0. Headline

Hot pages are **structurally healthy**: the dashboard fans its queries out in
parallel, the relation viewer batches by entity type (no per-entity N+1), and the
two heaviest lists (documents, money) are already bounded. Migration `077` (§7.4)
added the missing hot-path indexes. Two scalability *characteristics* remain — an
**unbounded tasks list** and **summary aggregations computed in JS over all rows**
— both fine at the target dataset but worth addressing before large tenants. These
are documented as recommendations, **not changed here**, because the safe fix is
UX-coupled (pagination) or needs real multi-currency data to validate.

---

## 1. What's good (verified)

- **Dashboard load is parallel.** `app/(dashboard)/dashboard/page.tsx` runs 6
  queries + dictionary in a single `Promise.all` after the cached `requireOrg`.
  No sequential waterfall. `getTransactions(org.id, { limit: 5 })` is bounded.
- **Relation viewer has no N+1.** `get-entity-relations.query.ts` and
  `get-action-item-related-entities.ts` group ids **by kind** and issue **one
  query per entity type**, not per entity (`Promise.all(map(async ([kind, idSet])…))`).
  The relation viewer does not load unrelated entities.
- **Bounded core lists:** documents page `limit: 30`, money page `limit: 20`.
- **Batched fan-outs are parallel and small-cardinality:** fx-conversion (per
  distinct currency), attachment signed-URLs (per attachment on one document),
  usage recalc (per ~6 keys). None are per-row over a large list.
- **Indexes (077):** `documents`, `domain_events`, `document_attachments` now
  have the indexes their hot queries need (previously none). These are the
  concrete perf fix for this pass.

---

## 2. Findings (recommendations, not yet changed)

### PERF-1 · Tasks list is unbounded
- **Evidence:** `app/(dashboard)/dashboard/tasks/page.tsx` calls
  `getTodosQuery(org.id, { sort })` with **no limit**; `get-tasks.ts` only applies
  a limit `if (options.limit)`. At 500 tasks the page loads all 500 rows every render.
- **Impact:** Linear growth; the main task page is the most-visited list. Fine at
  500, degrades for large tenants.
- **Recommended fix (UX-coupled → §7.9):** paginate or "load more" with a default
  page size (e.g. 50), backed by the existing `todos_org_id_idx`. A blind default
  cap would silently truncate, so pair it with pagination UX rather than shipping
  truncation alone.

### PERF-2 · Summary aggregations fetch all rows and reduce in JS
- **Evidence:**
  - `get-money-summary.ts` selects `type, amount, currency` for **all**
    transactions and reduces in JS (per-currency). A canonical DB aggregate,
    `get_org_money_summary` (migrations `014`/`041`), **exists but is not called** —
    the JS version reimplements it (likely for multi-currency breakdown).
  - `get-task-summary.ts` selects `status, due_date` for **all** non-deleted tasks
    and reduces in JS, where `SELECT status, count(*) … GROUP BY status` would do.
- **Impact:** Both run on every dashboard load and scale linearly with row count.
  Negligible at 500 rows; meaningful at 10k+.
- **Recommended fix:** move aggregation into the DB — call/extend
  `get_org_money_summary` for money (verify it covers multi-currency before
  switching), and a `GROUP BY status` (+ overdue predicate) for tasks. **Deferred**
  here: changing financial aggregation blind, without multi-currency fixtures to
  diff against, is too risky for a hardening pass. Do it with a test that asserts
  parity against the current JS output.

### PERF-3 · Subscriptions list unbounded (low risk)
- **Evidence:** `get-subscriptions.ts` has no `.limit()`; the page passes none.
- **Impact:** Low — subscriptions are low-cardinality (target = 25). Acceptable
  for launch; add a bound when pagination lands (§7.9).

---

## 3. Other checks

- **Server actions revalidate narrowly** — create actions call `revalidatePath`
  for the specific list + dashboard, not the whole tree. ✅
- **Search endpoints** — relation search filters by org + type (indexed via
  entity_links org/workspace indexes + 077). ✅
- **Analytics** — dashboard metrics/timeline read `domain_events` by
  `(organization_id, created_at)`, now indexed (077). ✅
- **Bundle** — no evidence of a regression in this pass; a real
  `next build --profile` / bundle diff is a §7.11 pre-release check.

---

## 4. Definition of Done — §7.6 status

| DoD item | Status |
|---|---|
| No obvious N+1 on critical pages | ✅ (dashboard parallel; relation viewer batched) |
| Hot pages responsive at realistic data | ✅ at target; PERF-1/2 flagged for scale |
| Large lists bounded | ⚠️ documents/money bounded; **tasks/subscriptions unbounded** (PERF-1/3 → §7.9) |
| Search queries indexed | ✅ (077 + existing) |
| Analytics avoid heavy per-render recompute | ⚠️ summaries reduce-in-JS (PERF-2), acceptable at target |
| No unacceptable bundle regression | ◻ confirm with a build profile in §7.11 |

**§7.6 exit:** Concrete win landed (077 indexes). PERF-1/2/3 are scale-oriented and
best fixed alongside the §7.9 pagination UX and with parity tests — recommended,
not forced, to avoid a hardening pass introducing list truncation or a financial
aggregation regression. Proceed to §7.7 (uploads/storage reliability).
