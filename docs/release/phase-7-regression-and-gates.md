# Phase 7.10 — Regression Checklist, Release Test Report & Known Issues

**Status:** Draft 1
**Date:** 2026-07-02
**Codebase:** `main`, migrations through `077`

---

## 0. Release test report (current)

All local gates **green** on the Phase 7 change set (migrations `076`/`077` **not
yet applied to remote**):

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ pass |
| Lint | `npm run lint` | ✅ pass |
| Unit/component tests | `npm run test` | ✅ **489 passed**, 3 skipped (105 files) |
| Build | `npm run build` | ✅ pass |
| DB lint | `supabase db lint` | ◻ run against remote before deploy |
| E2E | `npm run test:e2e` | ◻ not configured |

Phase 7 added tests: reservation compensation (P1-3, 2 cases), limit-reached copy
(§7.9, 4 cases). Existing suite already covers the money-tx invariant, transfers,
categorization, relations, and auth resolution.

---

## 1. Regression checklist (maps plan §7.10 → coverage)

Legend: ✅ automated · 🔶 partial/indirect · 🧪 needs integration/DB test · 📝 manual

### Auth & Organization
- ✅ user can access own organization — `require-org` / `resolve-active-organization` (21 files touch auth)
- 🧪 user **cannot** access another org — RLS cross-tenant (reasoned in §7.2; add PostgREST-level test)
- ✅ non-admin cannot perform admin action — `updateMemberRole`/`removeMember` guards
- 🔶 member permissions enforced — role-permission maps tested indirectly

### Billing & Usage
- ✅ create within limit succeeds — reservation happy paths
- ✅ create over limit fails — `plan_limit_exceeded` → friendly copy (§7.9 test)
- 🧪 concurrent create cannot overshoot — DB-level (`FOR UPDATE` reserve, seat advisory lock); needs a concurrency/integration test
- ✅ failed create releases reservation — **P1-3 compensation test** (`create-transaction.action.test.ts`)
- 🔶 delete/revoke updates counters — removal triggers (migration 072); add an integration assertion
- 🧪 expired subscription blocks writes — `is_organization_writable` (DB); manual/integration

### Core Modules
- ✅ task create/update/complete — task action tests
- ✅ document upload/create — document service tests + P1-3
- ✅ money transaction create — transaction action tests (+ P1-3)
- ✅ transfer flow — transfer tests (single-row invariant)
- ✅ subscription create — subscription action tests
- ✅ **subscription attachment does NOT create money transaction** — asserted (`…not.toHaveBeenCalledWith("money_transactions")`)
- ✅ entity linking across modules — relation tests (17 files)

### Automations
- ✅ domain event emitted — envelope schema test + action tests
- ✅ auto-categorization works — categorization tests (16 files)
- ✅ suggestion flow works — suggestion tests
- ✅ cron does not duplicate — guaranteed by `money_ai_suggestions_one_pending_idx` (unit + structural)
- 🧪 reminders de-dup — add a test (§7.8 follow-up)

### UI
- ✅ dashboard/core lists/detail render — component tests + build
- 🔶 relation viewer renders — query tests
- ✅ permission-denied state renders — friendly copy paths
- ✅ limit-reached state renders — enriched copy (§7.9 test)

---

## 2. Required merge gates (per plan)

Before merging into the release branch, run and require green:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
# if available:
supabase db lint      # run against the migration set incl. 076/077
```

`test:e2e` / `test:db` are not configured; the reasoned RLS/concurrency checks in
§1 (🧪) are the gaps a future integration harness should close.

---

## 3. Known issues (documented, non-blocking)

### P2 (fix opportunistically — none block launch)
- **PERF-1/3** — tasks & subscriptions lists unbounded; fix with §7.9 pagination.
- **PERF-2** — money/task summaries reduce-in-JS (bypass `get_org_money_summary`
  RPC); fine at target size, optimize with parity test.
- **UX-1** — ~20 secondary routes lack `loading.tsx`.
- **Observability** — ~265 legacy `console.error` not yet structured (logger still
  captures them).
- **Signed-URL TTL** — confirm short-lived (ops, §7.11).

### Deferred (out of Phase 7 scope)
- `deals`/`clients` check→insert race — stays with the out-of-scope CRM module.
- **Webhook delivery** — registration-only today; delivery is a future feature.
- **Orphan-link sweep** — polymorphic `entity_links`; cleanup query documented (§7.4/§7.8).

### Integration-test gaps (🧪 above)
Cross-org RLS denial, concurrent-create-no-overshoot, expired-subscription-blocks-
writes, delete-updates-counters, reminders-de-dup. All reasoned/structurally
guaranteed; a DB/E2E harness should assert them before scaling the beta.

---

## 4. Definition of Done — §7.10 status

| DoD item | Status |
|---|---|
| Typecheck passes | ✅ |
| Lint passes | ✅ |
| Tests pass | ✅ (489) |
| Build passes | ✅ |
| No P0/P1 open | ✅ (all P1 fixed in §7.3; §7.2 security GREEN) |
| Known P2 issues documented | ✅ (§3) |

**§7.10 exit:** Gates green; no P0/P1 open; P2s catalogued. The 🧪 items are the
honest test-coverage frontier — structurally sound but not yet asserted by an
integration harness. Proceed to §7.11 (release ops & rollback).
