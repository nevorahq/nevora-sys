# Security — Nevora Business OS

> Security-first is a hard constraint, not a phase. RLS is the **primary** tenant
> boundary; application-level `.eq()` filters are defense-in-depth only. See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the rules and
> [`nevora-architect-prompt.md`](./nevora-architect-prompt.md) for the full
> rationale with code references.

## Per-change security checklist

Run through this before opening a PR that touches data, schema, or mutations:

```
[ ] Business table has organization_id
[ ] Workspace-scoped entity has workspace_id
[ ] RLS enabled on the table
[ ] SELECT policy exists
[ ] INSERT/UPDATE policy has WITH CHECK
[ ] Mutation has a permission check (owner/admin/member)
[ ] Server Action validates input with Zod
[ ] No service role in application logic
[ ] No client-trusted organization_id / workspace_id (taken from requireOrg())
[ ] No raw SQL interpolation
[ ] Critical action creates an audit log
[ ] Important business action emits a domain event
```

## Tenant isolation

- `organization_id` / `workspace_id` for writes come **only** from
  `requireOrg()` (the session) — never from `formData` or query params. Trusting
  client-supplied ids is an IDOR; `.eq()` does not close it.
- For reads, rely on RLS (as `getMoneySummary` does — no manual
  `.eq('organization_id')`). A duplicate `.eq()` is acceptable defense-in-depth
  but never a substitute for a policy.
- Every new business table gets its RLS policy in the **same migration**, using
  the helpers from the security-functions migration (`can_write_data()`,
  `can_delete_data()`, `is_org_member()`, `is_org_admin()`).

## SECURITY DEFINER functions

- Pin `search_path` and declare an explicit `GRANT EXECUTE` model
  (`035_rpc_grant_hardening.sql`, `037_security_definer_grants.sql`):
  - **public (`anon`)**: only slug/token-resolving functions
    (`create_booking_request_public`, `check_client_booking_conflict_public`,
    `get_invite_info`) — they never accept internal ids from the client.
  - **authenticated-only**: provisioning + membership RPC
    (`create_organization`, `invite_member`, `accept_invite`, …).
  - **internal-only**: trigger functions and provisioning helpers (EXECUTE
    revoked from clients).
  - **RLS helpers** (`is_org_member`, …) stay callable by `anon`/`authenticated`
    because they run inside RLS expressions.

## Rate limiting

- Public booking endpoints are protected by a **Postgres-backed** rate limiter
  (`lib/rate-limit/`, migrations `036`/`038`) — works in serverless/multi-instance
  environments, no external paid service.
- The write RPC `check_rate_limit` is **service_role only**; the public client
  cannot call it. `limit`/`window` are allow-listed per bucket in SQL (not set by
  the client). `identifier` is a SHA-256 hex of `IP (+ org slug)` — raw IP / email
  / phone are never stored or logged. On exceed: `429` + `Retry-After`.

## Secrets & service role

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. It is used solely by the rate
  limiter and the cron extraction-sweep worker (cross-org). If unset, those
  degrade to a fail-open no-op — never put it in request-path business logic.
- `CRON_SECRET` is **required and fail-closed** for `/api/cron/extraction-sweep`
  (Bearer auth). Generate with `openssl rand -hex 32`.
- `ANTHROPIC_API_KEY`, `RESEND_API_KEY` are server-only; never expose to the
  client. Only `NEXT_PUBLIC_*` values reach the browser.
- `.env.example` carries **empty values only** — never a real key, not even a
  test-mode one. Committed placeholders must stay blank (`STRIPE_SECRET_KEY=`),
  not fake-but-plausible strings, so secret scanners stay useful.

### Stripe test key — 2026-07-08 finding

A real Stripe **test-mode** secret key was found inside this repository's local git
object store. (The value is deliberately not reproduced here — this repo is public,
and even a key's account prefix identifies the Stripe account.) Scope, established
by scanning every object and every remote ref:

- It appears in **two blobs of `.env.example`**, reachable only from local
  `refs/codex/turn-diffs/checkpoints/*` — snapshots the Codex CLI takes of the
  working tree.
- It is **not** in any commit on `main`, **not** in `HEAD`'s `.env.example` (which
  has empty values), and **not** on the public GitHub remote — `git ls-remote origin`
  returns exactly four refs (`HEAD`, `refs/heads/main`, `refs/pull/1/head`,
  `refs/pull/2/head`), none containing the key.

So the key was **never published**, even though the repository is public. The
exposure was local-disk only.

**Resolution (2026-07-08):**

1. The two carrying refs were deleted (`git update-ref -d`), unreachable objects
   expired and `git gc --prune=now` run. Both blobs are now unresolvable; `main`,
   `origin/main` and the stash were untouched and `git fsck` is clean.
2. **Rotate the key in the Stripe Dashboard anyway.** It is a real credential of a
   real Stripe account and it sat unencrypted on disk. Rotation is cheap; assurance
   is not.
3. Never place a live value in `.env.example`, including test-mode keys.

Verify the current tree stays clean (the character classes keep this command from
matching its own documentation):

```sh
rg 'sk_(test|live)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|pk_live_[A-Za-z0-9]{10,}' -g '!node_modules' .
```

Verify git history stays clean (note: a `while read | git` loop silently fails
here — use the pipeline form):

```sh
git rev-list --all --objects \
  | git cat-file --batch-check='%(objectname) %(objecttype) %(rest)' \
  | awk '$2=="blob"{print $1}' \
  | git cat-file --batch \
  | grep -cE 'sk_(test|live)_[A-Za-z0-9]{10,}'   # expect 0
```

## Migrations & validation

- Schema changes are numbered SQL files (`NNN_name.sql`), idempotent via
  `IF NOT EXISTS` / `IF EXISTS`. One migration carries table + indexes + RLS +
  grants together. Never edit an already-applied migration.
- All Server Actions and API routes validate input with Zod before any write.
- No `any` in TypeScript; describe types so payloads are checked at the boundary.
