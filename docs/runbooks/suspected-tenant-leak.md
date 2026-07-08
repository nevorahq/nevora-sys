# Runbook — Suspected Tenant Leak

**Severity:** P0. Highest severity in the system. **Do not roll back first.**

A tenant leak means one organization saw another's data. Rolling back destroys the
evidence you need and does not close the hole.

## 1. Contain (minutes)

1. **Preserve evidence.** Snapshot logs. Note exact time, user id, org id, URL,
   and the record ids involved. Do not redeploy yet.
2. Identify the surface: page, Server Action, route handler, or RPC.
3. If a single route is implicated, disable it (feature flag, or return 404 in a
   hotfix) rather than reverting the whole app.

## 2. Diagnose

The system has four independent boundaries. Find which one failed — usually
exactly one did, and RLS caught the rest.

| Layer | Check |
|---|---|
| **Active org resolution** | Did the handler use `requireOrg()` / `requireAppAccess()`, or read `organization_id` from the client? Client-supplied org ids are never trusted. |
| **Query scoping** | Does the query `.eq("organization_id", ctx.org.id)`? |
| **RLS** | Is RLS enabled on the table, with an `is_org_member(organization_id)` policy? RLS is the *final* boundary — if data crossed, RLS was missing, bypassed, or the client was service-role. |
| **Service role** | Was `SUPABASE_SERVICE_ROLE_KEY` used in an interactive request handler? It bypasses RLS entirely. It is allowed **only** in explicitly scoped background jobs. |

Fastest triage query — find tables without RLS:

```sql
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
```

Then find any interactive handler using the service role:

```sh
grep -rn "SERVICE_ROLE" app/ modules/ lib/ | grep -v "cron\|sweep\|webhook"
```

## 3. Fix

- Add the missing `.eq("organization_id", …)` **and** the missing RLS policy.
  Both. Application scoping is a performance/UX concern; RLS is the boundary.
- Replace any service-role client in a request handler with the authenticated
  client (`@/lib/supabase/server`).
- Add a regression test: cross-org direct access must return a safe not-found.

## 4. Verify

- [ ] Cross-org detail URL → safe not-found (see smoke checklist §1).
- [ ] `supabase/tests/data_isolation_visibility_verification.sql` passes.
- [ ] Tampering with a client-supplied `organization_id` changes nothing.

## 5. Aftermath

- [ ] Determine blast radius: which orgs, which rows, how long.
- [ ] Preserve an immutable copy of the audit/domain-event trail.
- [ ] Notify affected orgs if data was actually exposed (not merely reachable).
- [ ] Post-mortem: which of the four layers was missing, and why the others did
      not catch it.

## Related

- `docs/security/SECURITY_TEST_MATRIX.md`
- `docs/security/PHASE2_POLICY_ENGINE.md`
- `supabase/tests/data_isolation_visibility_verification.sql`
