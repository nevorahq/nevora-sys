# Runbook — Rollback (operational)

**Strategy doc:** [`docs/release/rollback-plan.md`](../release/rollback-plan.md).
This file is the hands-on procedure.

## 0. Stop and read

Two situations where rollback is the **wrong** first move:

- **Suspected tenant leak.** Rolling back destroys evidence and does not close the
  hole. Go to `suspected-tenant-leak.md`.
- **Wrong money posted.** Posted transactions are immutable. Correct with an
  explicit reversing entry. Never `DELETE` a ledger row, never roll a migration
  back to "unpost" it.

## 1. App rollback (default, ~1 minute)

```
Vercel → Deployments → last known-good → Promote to Production
```
or `vercel rollback`.

Verify immediately:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/api/health   # 200
curl -i https://<host>/api/cron/reminders | head -1                   # NOT 200
```

Then: `/dashboard` loads, and one create action succeeds.

This is sufficient for: bad UI, bad copy, broken route, a Server Action throwing,
a bad feature. **Most incidents end here.**

## 2. Paused-module leak (no rollback needed)

`NEVORA_ENABLE_CRM` / `NEVORA_ENABLE_BOOKING` are read at request time. Unset them
in the environment. No deploy, no rollback. Confirm `/dashboard/crm` → 404.

## 3. Database rollback (rare, deliberate)

Only when the migration itself is the fault.

**Before touching anything:** take a snapshot / note the PITR timestamp.

Migrations here are applied **manually** (the Supabase CLI is not logged in) and
there is **no automated `down` script**. Decide by category:

| Migration type | Backward compatible? | Action |
|---|---|---|
| New table | Yes | Leave it. Roll the app back. |
| New nullable column | Yes | Leave it. Roll the app back. |
| New index | Yes | Leave it (may drop later if it hurts writes). |
| New / replaced RPC | Usually | If replaced, re-apply the **previous** `CREATE OR REPLACE`. |
| New RLS policy | **Careful** | Reverting can *open* data. Read the diff first. |
| Dropped / renamed column | **No** | Restore from snapshot. Do not improvise. |
| Narrowed constraint | **No** | Data may already violate the old form. Snapshot. |
| In-place backfill | **No** | Original values are gone. PITR only. |

The rule: **additive migrations never need reverting.** The previous app runs fine
against a superset schema. Roll the app back and leave the database alone.

### Reverting a replaced function

A later migration `CREATE OR REPLACE`s a function. To revert, re-apply the prior
definition verbatim — do not hand-edit. Find it:

```sh
grep -ln "CREATE OR REPLACE FUNCTION public.<name>" supabase/migrations/*.sql
```

The **last** file listed is what is live. The one before it is your target.
(`test/release-invariants.test.ts` relies on exactly this ordering.)

### Data corruption

1. Stop writes (put the app in maintenance / roll back to a build that cannot
   reach the broken path).
2. PITR restore to just before the migration.
3. Post-mortem before re-applying anything.

## 4. After any rollback

- [ ] `/api/health` → 200.
- [ ] One write path works.
- [ ] Cron routes still fail closed.
- [ ] Re-run the ⚑ items in `docs/release/smoke-test-checklist.md`.
- [ ] Record: what broke, what was rolled back, when, and the follow-up.
- [ ] Confirm the migration baseline still matches `supabase/migrations/`
      (tree `000`–`099`, next free `100`; remote applied through `097` until
      `098`/`099` are deployed).
