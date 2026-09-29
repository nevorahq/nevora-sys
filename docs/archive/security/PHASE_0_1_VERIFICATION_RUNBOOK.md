# Phase 0/1 — Staging Verification Runbook

Final DB-side confirmation for the trial-identity hardening (089) and the
security follow-ups (090). Everything here is **read-only or transaction-rolled-back**
— no persistent writes. Run against **staging** (or a local `supabase db reset`),
**never production**.

> Why this exists: `trial_identity_verification.sql` and the constraint/RPC
> checks were authored but not executed in the build environment (no DB access).
> This runbook is the last green light for closing Phase 1 without caveats.

---

## 0. Prerequisites & safety

- **Connection must be session-mode**: use the **direct** connection (port `5432`)
  or the **Session pooler** (port `5432`). Do **NOT** use the transaction pooler
  (port `6543`) — the harness relies on a single session transaction, advisory
  locks, `set_config(..., is_local)` and a transactional `DISABLE TRIGGER`.
- **Role**: connect as the `postgres` role (Supabase → Project Settings →
  Database → Connection string → URI). The **service-role API key is NOT usable
  with psql** — you need the database password. Reset it in the dashboard if the
  stored one is stale.
- **Safety**: the harness `INSERT`s fixtures into `auth.users` / `organizations`
  etc. inside `BEGIN … ROLLBACK`; Postgres DDL (incl. `DISABLE TRIGGER`) is
  transactional, so a failure or the final `ROLLBACK` reverts everything. It uses
  fixed test UUIDs (`d0000000-…`, `e0000000-…`) and `@example.test` emails —
  collisions with real staging rows are effectively impossible.
- `psql` installed locally (`psql --version`).

```bash
# Set once for the session (paste the URI from the dashboard, keep the quotes).
export STAGING_DB="postgresql://postgres:<PASSWORD>@<HOST>:5432/postgres"
```

---

## 1. Object/grant existence — migrations 089 + 090 are really on remote (read-only)

```bash
psql "$STAGING_DB" -v ON_ERROR_STOP=1 <<'SQL'
\echo '== 089: pepper seeded (expect 1) =='
SELECT count(*) AS pepper_rows FROM private.app_secrets WHERE key = 'trial_identity_pepper';

\echo '== 089: HMAC identity differs from unsalted sha256 (expect t) =='
SELECT public.billing_identity_hash('a@b.com') <> public.normalized_email_hash('a@b.com') AS keyed_hash_ok;

\echo '== 089: entitlement RPCs exist + EXECUTE granted to authenticated =='
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_trial_eligibility_for_current_user',
                    'claim_trial_for_current_user',
                    'get_organization_access_state','can_write_org')
ORDER BY p.proname;

\echo '== 089: internal hash fns are NOT executable by authenticated (expect f,f) =='
SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('billing_identity_hash','billing_identity_pepper');

\echo '== 089: billing_identities table + unique constraints on claims =='
SELECT to_regclass('public.billing_identities') AS billing_identities_tbl;
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.billing_trial_claims'::regclass
  AND conname = 'billing_trial_claims_identity_hash_key';
SELECT indexname FROM pg_indexes
WHERE tablename = 'billing_trial_claims'
  AND indexname = 'billing_trial_claims_organization_id_key';

\echo '== 090: init_free_subscription now has explicit search_path (expect {search_path=...}) =='
SELECT proname, proconfig FROM pg_proc WHERE proname = 'init_free_subscription';

\echo '== 090: accept_invite_link contains FOR UPDATE (expect t) =='
SELECT position('FOR UPDATE' IN pg_get_functiondef('public.accept_invite_link(text)'::regprocedure)) > 0 AS has_for_update;

\echo '== Appendix A definitive: ANY SECURITY DEFINER fn missing search_path (expect 0 rows) =='
SELECT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'
  )
ORDER BY 1;
SQL
```

**Pass criteria (Step 1):**
- `pepper_rows = 1`
- `keyed_hash_ok = t`
- all four entitlement RPCs listed, `authed_can_exec = t`
- `billing_identity_hash` / `billing_identity_pepper` → `authed_can_exec = f`
- `billing_identities_tbl = public.billing_identities`; the constraint and index rows returned
- `init_free_subscription.proconfig` contains `search_path=public, pg_catalog`
- `has_for_update = t`
- **the Appendix-A query returns 0 rows** (no SECURITY DEFINER function is missing `search_path`)

---

## 2. Trial-identity behaviour harness (089) — positive / negative / race

```bash
psql "$STAGING_DB" -v ON_ERROR_STOP=1 -f supabase/tests/trial_identity_verification.sql
```

**Pass criteria:** the run ends with

```
NOTICE:  trial_identity_verification: ALL CHECKS PASSED
ROLLBACK
```

and **exit code 0** (`echo $?` → `0`). Any failed assertion raises
`trial_identity verification failed: …` and aborts with a non-zero exit.

Scenarios asserted (for your reference): HMAC ≠ sha256 + canonicalization · fresh
owner claims once (trialing sub + future `trial_ends_at` + HMAC claim row +
security event with no raw email + `access_state = trialing`) · same identity
denied a 2nd org · `init_trial_subscription` denial path · non-owner →
`permission_denied` · unauthenticated → `auth_required` · unconfirmed email →
`verified_email_required` · developer-unlimited → `developer_unlimited` +
`can_write_org = t` · expired/consumed trial → `trial_already_used` +
`trial_expired` · no `email` column on claim/identity tables · duplicate
`identity_hash` / `organization_id` inserts hit `unique_violation`.

---

## 3. Regression — 086 trial-reuse harness still green under the new schema

```bash
psql "$STAGING_DB" -v ON_ERROR_STOP=1 -f supabase/tests/trial_reuse_verification.sql
```

**Pass criteria:** runs to completion, `ROLLBACK`, exit code 0. Confirms 089's
changes to `init_trial_subscription` didn't break the original guarantees.

---

## 4. Optional — raw-email masking on live data (eyeball, read-only)

The app already masks via `maskEmail()` (unit-tested), but to confirm on real
staging rows written *after* the deploy:

```bash
psql "$STAGING_DB" -v ON_ERROR_STOP=1 <<'SQL'
\echo '== newest member.invited / client.created — email must be masked (j***@domain), never a full local part =='
SELECT event_name, created_at, payload->>'email' AS email_in_event
FROM public.domain_events
WHERE event_name IN ('member.invited','client.created')
ORDER BY created_at DESC
LIMIT 10;
SQL
```

**Pass criteria:** every `email_in_event` looks like `x***@domain.tld` (single
leading char + `***`) or `***` — **no full local part**. (Rows written before the
deploy may still show old raw values; only new ones must be masked.)

---

## 5. App-side items — already covered, no DB step

- Push-subscription service-role removal, `maskEmail`, and the entitlement
  parsers are covered by `npm run lint` / `npm run typecheck` / `npm test`
  (663 pass) / `npm run build` — all green in CI.
- Optional live smoke (needs a browser + logged-in session on staging):
  enable notifications on a device → row appears in `push_subscriptions` for
  your `user_id`; toggle off → row deleted. This exercises the RLS path (no
  service role).

---

## Sign-off checklist

- [ ] Step 1 — all object/grant/`search_path` checks pass (Appendix-A query = 0 rows)
- [ ] Step 2 — `trial_identity_verification.sql` → `ALL CHECKS PASSED`, exit 0
- [ ] Step 3 — `trial_reuse_verification.sql` → completes, exit 0
- [ ] Step 4 — (optional) new invite/client events show masked email
- [ ] Step 5 — CI green (already true) / optional push smoke

**When Steps 1–3 are green, Phase 0 and Phase 1 are closed without caveats.**
