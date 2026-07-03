# Phase 7.1 — Production Readiness Audit

**Status:** Draft 1 — investigation complete, findings classified
**Date:** 2026-07-02
**Auditor:** Engineering (Claude Code assisted)
**Codebase state:** `main` @ `acdadd6`, migrations through `075_reminder_schedules_and_attention_counters.sql`
**Scope:** Full technical audit after Phase 6 (Billing, Usage Limits & Atomic Enforcement), per Phase 7 plan §7.1.

---

## 0. Executive summary

Nevora is **materially more hardened than a typical MVP**. The Phase 6 atomic usage
work is real: `reserve_organization_usage` / `release_organization_usage` are
`SECURITY DEFINER`, membership- and writability-gated, use `SELECT … FOR UPDATE`
to serialize concurrent reservations, and are compensated by application code and
`AFTER DELETE/UPDATE` triggers. Cron endpoints are fail-closed on `CRON_SECRET`.
Public booking endpoints are rate-limited, honeypotted, and resolve all internal
IDs server-side. The developer API authenticates + rate-limits. A structured JSON
logger exists. RLS appears enabled on every table created in recent migrations.

**No confirmed P0 cross-organization data leak was found** in the write paths and
public surfaces reviewed. However, the audit is **not yet exhaustive across all
~40 tables' RLS policies** (see §7 Audit completeness), so "no P0" is a
*provisional* conclusion pending §7.2 Security/RLS deep pass.

The real production risk is concentrated in **two parallel enforcement systems**
(legacy `checkPlanLimit` COUNT path vs. atomic reservations) and **counter-drift
edge cases**, not in access control.

### Blocker counts

| Severity | Count | Theme |
|---|---|---|
| **P0** (must fix before any prod) | 0 confirmed | *(pending RLS deep pass — §7.2)* |
| **P1** (must fix before public launch) | 4 | seat-limit race, no-subscription = unlimited, reservation leak on throw, dual enforcement drift |
| **P2** (document, fix opportunistically) | 6 | error boundaries, error copy detail, migration numbering, orphaned storage, invite-flow verification, legacy path removal |

---

## 1. Scope coverage

| Area | Reviewed | Verdict |
|---|---|---|
| Auth (`requireOrg`/`requireUser`) | ✅ | Solid — org context server-derived, never trusts cookie directly |
| Organizations / workspaces / multi-org | ✅ | `resolveActiveOrganizationId` never trusts cookie; fail-closed redirects |
| RLS | ⚠️ partial | Enabled on recent tables; **full policy-by-policy pass deferred to §7.2** |
| Billing (atomic reservations) | ✅ | Strong; `FOR UPDATE`, writability gate, unlimited=`NULL` |
| Plan limits / usage counters | ⚠️ | **Dual system** — atomic (4 keys) + legacy COUNT (members/deals/clients/ai/storage) |
| Uploads / storage | ✅ | Byte-limit BEFORE-INSERT trigger + app assert; permission-gated |
| Domain events | ✅ (surface) | Emitted via `emitDomainEvent`; contract doc deferred to §7.8 |
| Cross-module relations (`entity_links`) | ✅ | Unique active index exists (047) |
| Documents automation | ✅ (surface) | `after()` fast path + cron sweep safety net, fail-closed |
| Subscriptions / money / tasks / transfers | ✅ | All use atomic reservation + compensation |
| API keys / webhooks | ✅ | Reserved atomically; API authenticated + rate-limited |
| Cron jobs | ✅ | Fail-closed on `CRON_SECRET` (3 crons) |
| Background actions (`after()`) | ✅ (surface) | Present; idempotency review deferred to §7.8 |
| Dashboard UX / error handling | ⚠️ | 4 route error boundaries; **no `app/global-error.tsx`** |

---

## 2. Blockers

> **Resolution status (updated 2026-07-02, Phase 7.3):** P1-1 fixed
> (migration `076`), P1-3 fixed (reservation compensation across all callers +
> regression tests), P1-2 and P1-4 addressed via policy + `docs/billing/usage-model.md`
> (with a pre-launch reconciliation check). `deals`/`clients` remain deferred with
> the out-of-scope CRM module. Gates: typecheck/lint/test/build all green.

### P1 — must fix before public launch

#### P1-1 · Seat/limit enforcement for `members`, `deals`, `clients` is non-atomic (check→insert race) — ✅ FIXED (migration 076)
- **Evidence:** `modules/members/actions/invite-member.action.ts:44`, `modules/settings/actions/invite-member.ts:27`, `modules/crm/actions/create-deal.action.ts:18`, `modules/crm/actions/create-client.action.ts:18` all call `checkPlanLimit(...)` (a live `COUNT` in `lib/billing/check-limit.ts`) **before** the insert, with no `FOR UPDATE` reservation.
- **Risk:** Concurrent requests both pass the check, then both insert → **plan seat/limit overshoot** (billing leakage). This is exactly the `check → insert → increment` pattern Phase 7.3 forbids.
- **Severity rationale:** `members` is directly billing-relevant (paid seats). `deals`/`clients` are CRM — **out of Phase 7 product scope**, but the *enforcement code* is live in this build.
- **Fix direction:** Extend `reserve_organization_usage` to cover `members` (add `members.count` key + `plan_limits`), route invite through it. Defer `deals`/`clients` with CRM, or gate the CRM module off in prod.

#### P1-2 · Organization without a `billing_subscriptions` row is treated as *unlimited + always writable* — ✅ ADDRESSED (policy + reconciliation)
- **Evidence:** `is_organization_writable` (`033_start_plan_enforcement.sql:98`) `COALESCE(..., TRUE)`; `checkPlanLimit` returns `{ allowed: true }` when `!sub` (`lib/billing/check-limit.ts`); `reserve_organization_usage` treats a missing normalized limit as unlimited (072, comment "Phase 6 compatibility").
- **Risk:** Any org that reaches the dashboard **without** a subscription row gets **unlimited free usage and unrestricted writes**. Intended as legacy-compat, but in production every org must have a trial subscription. A single onboarding gap = free unlimited tenant.
- **Fix direction:** Verify onboarding **always** creates `billing_subscriptions` (trial) atomically with the org. Add a DB-level safety (e.g. deny writes when no subscription, or a backfill/guard). Decide + **document** the "no subscription" policy (Phase 7.3 DoD: "organization without subscription handled predictably").

#### P1-3 · Usage-reservation leak on unexpected exception after `reserve…()` succeeds — ✅ FIXED (all callers + tests)
- **Evidence:** `modules/tasks/actions/create-task.action.ts` reserves `tasks.count`, then the **outer `catch (err)`** (post-insert block: assignees upsert, `emitDomainEvent`, `emitAuditLog`) returns `"Server error"` **without** `releaseOrganizationUsage`. If a throw occurs between a successful reserve and a successful insert (e.g. `createClient()` throws), the counter is incremented but no row exists → **permanent upward drift**, eventually denying legitimate creates. The insert-error branch *does* release correctly; the unexpected-throw branch does not.
- **Scope:** Pattern must be checked across **all** reserve callers: `create-transaction`, `create-transfer`, `create-subscription`, `create-document`, `api-key-service`, `webhook-service`, `documents/upload/route.ts`, `create-task-document-with-attachments`, `create-subscription-document-with-attachments`.
- **Fix direction:** Wrap reserve→insert in a single try with a `finally`/compensation that releases on *any* pre-commit failure, or move enforcement fully DB-side. Add a reconciliation job to true up counters against live `COUNT`.

#### P1-4 · Two parallel limit systems create drift and inconsistent semantics — ✅ DOCUMENTED + storage normalized to bytes
- **Evidence:** Atomic path (`organization_usage_counters` + `reserve_organization_usage`) covers `tasks/documents/money_transactions/subscriptions/developer_api_keys/developer_webhooks`. Legacy path (`lib/billing/check-limit.ts` → live COUNT, `resolve-account-limits.ts`) covers `members/workspaces/deals/clients/ai_calls/storage_mb`. `UsageLimitsCard` / `get-usage.ts` read one model; enforcement uses the other in places.
- **Risk:** Counters and displayed usage can disagree; storage is bytes in the trigger (072) but MB in `checkPlanLimit` — **two units for the same limit**. Maintenance hazard + user-visible inconsistency.
- **Fix direction:** Pick counters as the single source of truth for the 6 atomic keys; keep legacy COUNT only for keys with no counter, and **document the split** (Phase 7.3 DoD "Plan enforcement behavior documented"). Normalize storage to bytes everywhere.

### P0 — none confirmed

No confirmed P0 in reviewed paths. **Conditional P0 watch:** if the §7.2 RLS deep
pass finds any table where a policy uses a client-supplied `organization_id` or
lacks an `is_org_member`/`organization_id = …` predicate, that becomes P0.

---

## 3. Non-blocking issues (P2)

- **P2-1 · No `app/global-error.tsx`.** Only 4 route-level `error.tsx` exist (`dashboard`, `settings`, `actions`, `documents/new`). Lists/detail routes for tasks, money, subscriptions, documents and the root have no boundary → unhandled render errors fall through to the framework default. *(Phase 7.5/7.9)*
- **P2-2 · Limit-reached copy lacks numbers.** Reservation errors *are* mapped to friendly strings (`billing-service.ts:312-316`), but the message omits **current usage / plan limit / next step** that Phase 7.9 "Critical Copy" requires. Legacy `checkPlanLimit` copy includes `used/limit` but is a different code path.
- **P2-3 · Migration numbering conflict with the plan.** Phase 7 plan suggests `073–076`, but `073/074/075` are **already used** (notifications/reminders). Next free number is **`076`**. Update the plan's naming section.
- **P2-4 · Orphaned storage objects on partial upload failure.** `documents/upload/route.ts` releases `documents.count` when the document insert fails, but if a file is uploaded to storage and a later insert (attachment/document) fails, the object may remain. Storage limit is a live `SUM`, so no counter drift — but dangling blobs accumulate. *(Phase 7.7)*
- **P2-5 · Invite-accept/decline take `organizationId` from client formData.** `accept-invite.action.ts:28`, `decline-invite.action.ts:20`. **Likely safe** — the `accept_invite` RPC is documented to validate `auth.uid()` ownership — but this must be **confirmed** by reading the RPC body (deferred to §7.2). Listed as risky flow, not a confirmed bug.
- **P2-6 · Legacy billing code is dead-weight / partially live.** `lib/billing/check-limit.ts`, `resolve-account-limits.ts`, `account-limits.ts` overlap with the counter model. Some are still authoritative (P1-1/P1-4); the rest should be removed once atomic coverage is complete.

---

## 4. Deprecated / legacy paths

| Path | Status | Action |
|---|---|---|
| `lib/billing/check-limit.ts` (`checkPlanLimit`) | Live for members/deals/clients/ai/storage | Migrate to atomic where billing-relevant (P1-1); document the rest |
| `lib/billing/resolve-account-limits.ts` / `account-limits.ts` | Live behind `checkPlanLimit` | Retire with the above |
| `is_organization_writable` — 3 definitions (`027`, `033`, `059`) | Later supersedes earlier | Confirm final semantics is the only one live; document |
| `start_limit_attachments` trigger | Dropped + replaced by `phase6_storage_bytes_limit` (072) | ✅ already handled — verify not re-created anywhere |
| Storage in **MB** (`checkPlanLimit`) vs **bytes** (trigger 072) | Conflicting units | Normalize to bytes (P1-4) |

---

## 5. Risky flows (require targeted verification in §7.2–7.8)

1. **Invite accept/decline** — client-supplied `organizationId`; verify `accept_invite`/`decline_invite` RPCs gate on `auth.uid()`. *(P2-5)*
2. **No-subscription org** — verify onboarding always provisions a trial subscription; otherwise unlimited-tenant risk. *(P1-2)*
3. **Public booking endpoints** (`app/api/public/booking/*`) — unauthenticated write surface; verify RPC-side org resolution + rate-limit buckets hold under load and that no internal IDs are trusted.
4. **Cron endpoints** — fail-closed today; verify `CRON_SECRET` is set in prod env (release checklist §7.11) or all automation silently 503s.
5. **Concurrent create at limit** — verify `reserve_organization_usage` `FOR UPDATE` prevents overshoot with a real concurrency test (§7.3).
6. **Partial upload / partial insert** — verify storage cleanup + counter compensation across the multi-step document+attachment flow (§7.7).
7. **Reservation compensation on throw** — audit every reserve caller for `finally`-style release (P1-3).

---

## 6. Release-critical tests (feeds §7.10)

Existing: **94 `*.test.ts(x)`** files, including reservation/compensation tests for
create-transaction, create-transfer, create-subscription, and the document
services. Gaps to add before release:

- [ ] **Concurrent create at limit does not overshoot** (tasks, docs, money, subs) — true parallel calls.
- [ ] **Reservation released on post-reserve throw** (mock a throw between reserve and insert).
- [ ] **Cross-org read/write denied** for each core table (RLS regression) — feeds §7.2.
- [ ] **No-subscription org write behavior** matches the documented policy (P1-2).
- [ ] **Member seat limit not overshot** under concurrent invites (P1-1).
- [ ] **Subscription attachment flow creates NO money transaction** (already a documented invariant — lock it with a test).
- [ ] **Storage limit enforced in bytes** consistently (app + trigger agree).
- [ ] **Non-admin cannot call admin/billing server actions** directly.

---

## 7. Audit completeness (what this pass did NOT fully cover)

Honest boundaries of this Draft 1 so §7.2+ don't assume false coverage:

- **RLS was spot-checked, not exhaustively verified.** Recent migrations (069–075)
  enable RLS on every `CREATE TABLE`, and core helpers (`is_org_member`,
  `is_organization_writable`) look correct, but a **policy-by-policy pass over all
  tables** (especially older migrations and `entity_links`, `domain_events`,
  storage buckets, booking tables) is required and is the §7.2 deliverable.
- **RPC bodies** for `accept_invite`, `decline_invite`, and the booking RPCs were
  not read line-by-line — flagged as risky flows.
- **Performance / N+1** (§7.6) not assessed here (e.g. `requireOrg` runs 2–3
  sequential queries per render; acceptable but note for §7.6).
- **Domain-event payload contracts** (§7.8) not enumerated.

---

## 8. Definition of Done — §7.1 status

| DoD item | Status |
|---|---|
| All production-critical flows listed | ✅ (§1, §5) |
| All legacy limit calls found or confirmed gone | ✅ — found & mapped (§4); **not gone** (P1-1/P1-4) |
| All write paths checked for atomic usage enforcement | ⚠️ 6 keys atomic; members/deals/clients legacy (P1-1) |
| All unsafe flows have an issue/fix direction | ✅ (§2, §5) |
| Blockers classified P0/P1/P2 | ✅ (§2, §3) |

**§7.1 exit recommendation:** Proceed to **§7.2 Security/RLS deep pass** (closes the
conditional-P0 gap and P2-5), then **§7.3 Billing/Usage hardening** to resolve
P1-1 through P1-4. Do not begin controlled launch (§7.12) until P1-1..P1-4 are
closed and the RLS deep pass confirms no cross-org leakage.
