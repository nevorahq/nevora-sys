# Rollback Plan — Nevora Business OS

**Status:** Canonical · **Last updated:** 2026-07-08 (Phase A)
**Supersedes:** [`phase-7-rollback-plan.md`](./phase-7-rollback-plan.md) (kept for
history; scoped to migrations 076/077)
**Operational detail:** [`docs/runbooks/rollback.md`](../runbooks/rollback.md)

---

## 0. Principles

- **App rollback is instant and safe** — promote the previous Vercel deployment.
- **Prefer app-only rollback.** Touch the database only when a migration itself
  is the fault.
- **Never roll a migration back to "fix" an app bug.** Data loss is permanent;
  a bad deploy is not.
- **Money is never rewritten.** Posted transactions are immutable. A wrong
  transaction is corrected by an explicit reversing entry, never by `DELETE`.

## 1. Phase A specifics

Phase A introduced **no schema change**. The baseline is unchanged at `000`–`093`.

That makes Phase A rollback purely an app rollback: promote the previous
deployment. The database needs no attention at all.

Two Phase A behaviours worth knowing during a rollback:

| Change | Rolling back is safe because |
|---|---|
| `/dashboard` is the Action Center; overview moved to `/dashboard/overview` | Both routes exist in the new build; the old build serves the old topology. No persisted state points at `/dashboard/overview`. |
| `/dashboard/actions` 307s to `/dashboard` | A 307 is not cached. Persisted `notifications.target_url = '/dashboard/actions'` resolves under **both** builds. |
| CRM/Booking gated by `NEVORA_ENABLE_*` env flags | Flags are read at request time. Unsetting or setting them needs no deploy. |

### Emergency un-pause (not a rollback)

If a paused module must be restored for a specific environment, set
`NEVORA_ENABLE_CRM=true` or `NEVORA_ENABLE_BOOKING=true` and redeploy. This
re-opens pages, Server Actions **and** route handlers together.

Do not do this on production to work around a bug. The modules are paused as a
*product* decision, and their copy, pricing, and tests all assume they are off.

## 2. App rollback (Vercel)

1. Vercel → Deployments → last known-good → **Promote to Production**
   (or `vercel rollback`).
2. Verify:
   - `/api/health` → 200
   - `/dashboard` loads
   - one create action succeeds
   - one cron route returns non-200 without `CRON_SECRET`

Time to recover: ~1 minute. No DB coordination.

## 3. Database rollback

Only when a migration is the fault.

**Before anything:** take a snapshot / PITR marker. See
[`docs/runbooks/rollback.md`](../runbooks/rollback.md) for the full procedure,
including the additive-vs-destructive decision table.

Rules:

- Additive migrations (new table, new nullable column, new index, new RPC) are
  **backward compatible**. The previous app runs fine against them. Do **not**
  reverse them — just roll the app back.
- Destructive migrations (drop/rename column, narrow a constraint, backfill in
  place) require the runbook and a maintainer decision. Migrations are applied
  manually here; there is no automated `down`.
- RLS policy changes: reverting a policy can *open* data. Review the diff before
  reverting, never revert blind.

## 4. Decision table

| Symptom | Action |
|---|---|
| Bad UI / bad copy / broken route | App rollback |
| Server Action throws for all users | App rollback |
| Paused module leaked | Unset `NEVORA_ENABLE_*`; no deploy needed |
| Cron erroring | Disable the schedule in `vercel.json`, redeploy; investigate |
| Wrong money posted | Reversing entry (never delete); see `runbooks/rollback.md` |
| Migration broke reads | App rollback first; only then consider DB |
| Migration corrupted data | Stop writes → PITR restore → post-mortem |
| Suspected tenant leak | **Do not roll back.** Follow `runbooks/suspected-tenant-leak.md` |

## 5. After any rollback

- [ ] Record what broke, what was rolled back, and when.
- [ ] Confirm `/api/health` and one write path.
- [ ] Re-run `docs/release/smoke-test-checklist.md` §⚑ items.
- [ ] Open a follow-up before re-attempting the release.
