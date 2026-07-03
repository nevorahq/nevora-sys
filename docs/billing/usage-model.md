# Billing Usage & Limit Enforcement Model

**Owner:** Billing
**Last updated:** 2026-07-02 (Phase 7.3)
**Related audits:** `docs/audits/phase-7-production-readiness-audit.md`,
`docs/audits/phase-7-security-rls-audit.md`

This document is the single source of truth for how plan limits are enforced.
Phase 7.3 hardened it; read this before touching any create/delete path.

---

## 1. Two enforcement mechanisms (by design)

Limits are enforced by **one of two atomic mechanisms**, never by a bare
`check → insert`:

### A. Reservation counters — 6 product keys

`tasks.count`, `documents.count`, `money_transactions.count`,
`subscriptions.count`, `developer_api_keys.count`, `developer_webhooks.count`.

- **Reserve before insert:** `reserveOrganizationUsage(orgId, key, n)` →
  `reserve_organization_usage` RPC (migration 072). The RPC:
  - checks `auth.uid()` + `is_org_member`,
  - checks `is_organization_writable`,
  - reads the plan cap from `plan_limits` (`period='lifetime'`),
  - `SELECT … FOR UPDATE` on the counter row (serializes concurrent reserves),
  - raises `plan_limit_exceeded` if `value + n > limit`,
  - otherwise increments and returns the new value.
- **Release on removal:** `AFTER DELETE OR UPDATE OF deleted_at/revoked_at/is_active`
  triggers (`release_product_usage_on_removal`) keep the counter equal to live
  occupancy. Soft delete, hard delete, revoke, and deactivate all decrement.
- **Compensation on failed insert (P1-3):** application code releases the
  reservation if the row is **never committed**. The rule, applied uniformly:
  > Set a `reserved`/`committed`/`documentCreated` flag false the moment the
  > insert commits. Release in the failure path **only while no row exists**.
  > Once a row exists, the removal trigger owns the counter — releasing again
  > would drift it negative.
  Every reserve caller now follows this (create-task/-document/-transaction/
  -transfer/-subscription actions, the upload route, the two
  `*-document-with-attachments` services, and the api-key/webhook services via a
  `try/finally`).

`NULL` limit = **unlimited** (intentional). A missing normalized `plan_limits`
row is also treated as unlimited (Phase 6 compatibility).

### B. Trigger-enforced caps — members & storage

Some limits can't use a simple counter because they're inserted through multiple
`SECURITY DEFINER` RPCs or are computed from live data. These are enforced by
`BEFORE INSERT` triggers, which are equally atomic and cannot be bypassed:

- **`members` (P1-1, migration 076):** `enforce_member_seat_limit` on
  `public.memberships`. Serializes concurrent inserts per org with
  `pg_advisory_xact_lock`, then enforces `plans.max_members` against live
  `active + invited` seats. Covers every insert path (`invite_member`,
  `accept_invite`, `accept_invite_link`, `create_organization`). App-level
  `checkPlanLimit('members')` remains only as a friendly pre-check.
- **`storage.bytes` (migration 072):** `enforce_storage_bytes_limit` on
  `document_attachments`. Enforced in **bytes**, summed live from
  `document_attachments`, against `plan_limits.storage.bytes`.

`max_members` semantics: `NULL` or `-1` = unlimited.

---

## 2. Storage is measured in BYTES (P1-4)

The authoritative unit is **bytes**, everywhere that enforces:
- `assertPlanLimit(orgId, "storage.bytes", totalBytes)` in upload paths,
- `enforce_storage_bytes_limit` trigger (bytes),
- `plan_limits.storage.bytes`.

> **Deprecated:** the `storage_mb` branch in `lib/billing/check-limit.ts`
> (megabytes) is **not on any live write path** — no caller passes `storage_mb`.
> It is retained only for the legacy `checkPlanLimit` surface and should be
> removed when that helper is retired (see §4). Do not add new callers.

---

## 3. Organization without a subscription (P1-2)

**Policy:** every organization **must** have a `billing_subscriptions` row.
`create_organization` (migration 049) guarantees this — it calls
`init_trial_subscription` atomically with org + owner + workspace creation, so a
normally-provisioned org always has a 14-day trial.

**Fallback behavior (compatibility):** if an org somehow has *no* subscription
row (legacy/manual data), both `is_organization_writable` and the reservation
RPC treat it as **unlimited + writable** (`COALESCE(…, TRUE)`). This is a
deliberate "don't brick existing data" default, **not** a licensed state.

**Operational guard (do this before public launch):** run the reconciliation
query in §5 to confirm zero orgs without a subscription. If any exist, backfill a
trial/plan rather than relying on the unlimited fallback.

---

## 4. Legacy `checkPlanLimit` — status

`lib/billing/check-limit.ts` (live `COUNT` per metric) is **still authoritative
only** for keys with no counter/trigger: `deals`, `clients`, `workspaces`,
`ai_calls`. `members` is now trigger-atomic (§1B); `storage` is bytes-atomic.

- `deals` / `clients` belong to the **CRM module, out of Phase 7 scope** — their
  check→insert race is accepted and tracked, not fixed here.
- `ai_calls` is a monthly ledger count; a small overshoot is low-impact.
- When CRM is hardened (or gated off), retire `checkPlanLimit` and the dead
  `storage_mb`/`members` branches.

---

## 5. Reconciliation & invariants

Counters should equal live occupancy. Use these to detect drift:

```sql
-- Orgs without a subscription (P1-2): expect 0 rows before launch.
SELECT o.id, o.slug
FROM public.organizations o
LEFT JOIN public.billing_subscriptions bs ON bs.organization_id = o.id
WHERE bs.id IS NULL;

-- Counter drift vs. live rows (example: tasks). Expect value = live count.
SELECT c.organization_id, c.value AS counter,
       (SELECT count(*) FROM public.todos t
        WHERE t.organization_id = c.organization_id AND t.deleted_at IS NULL) AS live
FROM public.organization_usage_counters c
WHERE c.key = 'tasks.count' AND c.period_start = '-infinity'
HAVING c.value <> (SELECT count(*) FROM public.todos t
        WHERE t.organization_id = c.organization_id AND t.deleted_at IS NULL);
```

**Invariants:**
- Counters never negative (`greatest(value - n, 0)` on release).
- No `check → insert → increment` on any limited write.
- A failed/aborted insert never leaves a reservation behind (§1A compensation).
- Members and storage cannot overshoot under concurrency (§1B).
