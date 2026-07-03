# Phase 7.9 — UX Release Polish Audit

**Status:** Draft 1 — targeted fixes landed, remaining polish scoped
**Date:** 2026-07-02
**Codebase:** `main`, migrations through `077`
**Scope:** Phase 7 plan §7.9 — empty/loading/error/limit states, copy, mobile,
navigation. No new features.

---

## 0. Headline

The app already has error boundaries (hardened in §7.5), permission-denied and
limit-reached handling, and responsive layouts. This pass landed two concrete
wins — **critical limit-reached copy** (now states the numbers) and **loading
skeletons for the four core lists** — and scopes the remaining polish (loading
states on secondary routes, list pagination) as bounded follow-ups.

---

## 1. Landed in this pass

### 1.1 Limit-reached copy now meets the "critical copy" bar
- **Before:** `You have reached the tasks.count limit for your plan. Upgrade to continue.`
  (raw key, no numbers).
- **After:** `You've reached your plan's task limit — 50 of 50 used. Upgrade your
  plan to add more.` — which limit, **current usage**, **plan limit**, next step.
- **How:** `limitReachedMessage()` in `billing-service.ts` maps the usage key to a
  friendly label and parses `current=/limit=` from the RPC `plan_limit_exceeded`
  DETAIL (falls back to a friendly generic line if unavailable). Covered by
  `limit-reached-message.test.ts` (4 cases).
- Applies everywhere reservations are enforced (tasks, documents, transactions,
  subscriptions, API keys, webhooks) since all route through `reserveOrganizationUsage`.

### 1.2 Loading skeletons for the core lists
Added `loading.tsx` for **tasks, money, documents, subscriptions** — the
highest-traffic lists, which previously showed the *previous* page until the new
one resolved. Skeletons reuse the design tokens (`animate-pulse`,
`bg-surface-sunken`, `--neu-radius`) matching the existing `actions`/`crm`
skeletons, and are responsive.

---

## 2. Remaining polish (recommended, bounded)

### UX-1 · loading.tsx missing on ~20 secondary routes
Routes without a loading skeleton include: `analytics`, `ai`, `billing`,
`booking/*`, `money/[transactionId]`, `money/accounts/[accountId]`, `money/rules`,
`subscriptions/[id]`, `tasks/projects*`, and the `settings/*` subpages. Lower
traffic than the four core lists; add skeletons opportunistically. Not a blocker.

### UX-2 · List pagination (ties to §7.6 PERF-1/3)
Tasks and subscriptions lists are unbounded (§7.6). The UX fix — "load more" or
pagination with a default page size — belongs here in §7.9 and closes the §7.6
scalability finding at the same time. Pair with the existing `todos_org_id_idx`.

### UX-3 · Empty-state consistency
Core modules render list content; confirm each has a purposeful empty state
("no tasks yet — create your first") vs. a bare empty list. Audit per module as a
copy pass; low risk, incremental.

---

## 3. Verified already-present states

- **Error states:** route boundaries + `global-error.tsx` (§7.5), no raw messages.
- **Permission-denied:** server actions return friendly "Only owners and admins…"
  copy; UI gates on role.
- **Limit-reached:** now enriched (§1.1); the RLS/writable guard surfaces
  "trial ended" copy on mutations.
- **Destructive actions:** delete/revoke flows exist with confirmation patterns.
- **Mobile:** list skeletons and existing components use responsive `sm:`/`lg:`
  breakpoints (see `crm/loading.tsx` desktop-table vs mobile-card split).

---

## 4. Definition of Done — §7.9 status

| DoD item | Status |
|---|---|
| Core flows usable on desktop & mobile | ✅ (responsive; skeletons added) |
| Limit messages clear (limit/usage/plan/next step) | ✅ **fixed** (§1.1) |
| Empty states useful | ⚠️ mostly present; consistency pass = UX-3 |
| No broken visual states | ✅ (boundaries + skeletons) |
| No raw technical error copy | ✅ (§7.5 + §1.1) |
| Navigation consistent | ✅ |
| Loading states present | ⚠️ core lists ✅; secondary routes = UX-1 |

**§7.9 exit:** Critical copy and core-list loading landed with tests. UX-1/2/3 are
incremental polish (secondary skeletons, pagination, empty-state copy) — bounded,
low-risk, and can trail the release or land in a focused UI PR. Proceed to §7.10
(regression suite).
