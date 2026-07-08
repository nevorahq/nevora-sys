# Runbook — Usage Counter Drift

**Severity:** P2 (P1 if it blocks a paying org from writing).

Symptom: an org's usage counter disagrees with the real row count — a limit fires
too early, or never fires.

## 0. Ground truth

Counters are maintained atomically by database triggers (migrations 072, 076, 081).
They are a **cache** of a `COUNT(*)`. The rows are the truth.

Two categories of work are **exempt** from usage counters by design:

- subscription payment tasks
- expenses posted by "Mark as paid"

Recording a real payment must never be blocked by a plan limit. If you see a
payment blocked by a limit, that is a bug, not drift.

## 1. Diagnose

Compare the counter to reality for one org:

```sql
-- counter (071: keyed counters, one row per key+period)
SELECT key, value, period_start, period_end
FROM public.organization_usage_counters
WHERE organization_id = '<org>'
ORDER BY key;

-- reality (example: tasks)
SELECT count(*) FROM public.todos
WHERE organization_id = '<org>' AND deleted_at IS NULL;
```

Repeat per `key` (tasks, documents, subscriptions, transactions, members,
ai_requests). Note counters are period-scoped via `UNIQUE (organization_id, key,
period_start)` — compare against the *current* period row, and remember a
per-period metric like `ai_requests` will not equal an all-time `COUNT(*)`.

Drift direction tells you the cause:

| Drift | Likely cause |
|---|---|
| Counter **higher** than reality | Soft-deleted rows not decremented; a delete path bypassing the trigger |
| Counter **lower** than reality | An insert path bypassing the trigger (service-role bulk insert, direct SQL) |
| Counter stuck at 0 | Trigger missing on the table after a migration recreated it |
| Counter double-counts | Both a service *and* a trigger increment (see `automation` docs) |

Check the trigger still exists — a `CREATE OR REPLACE TABLE`-style migration can
silently drop it:

```sql
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE NOT tgisinternal AND tgname LIKE '%usage%';
```

## 2. Fix

1. **Find the bypassing write path first.** Recomputing without fixing the cause
   means you will be back here next week.
2. Recompute the affected counter from the rows, for **one org at a time**, in a
   transaction.
3. Re-check immediately after; a counter that drifts again within minutes means
   the trigger is still missing.

Do not "fix" drift by raising the org's plan limit.

## 3. Verify

- [ ] `value` equals `COUNT(*)` for every non-period-scoped `key` on the org.
- [ ] Creating and soft-deleting a row moves `value` by exactly ±1.
- [ ] A subscription payment task and a mark-as-paid expense move **no** counter.
- [ ] Hitting a limit produces an honest message, not a 500.

## Related

- `docs/billing/usage-model.md`
- Migrations `071_phase6_billing_developer_access` (defines
  `organization_usage_counters`), `072_phase6_atomic_usage`,
  `076_phase7_member_seat_atomicity`, `081_fix_release_usage_trigger_missing_field`
