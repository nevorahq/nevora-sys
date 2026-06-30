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

## Migrations & validation

- Schema changes are numbered SQL files (`NNN_name.sql`), idempotent via
  `IF NOT EXISTS` / `IF EXISTS`. One migration carries table + indexes + RLS +
  grants together. Never edit an already-applied migration.
- All Server Actions and API routes validate input with Zod before any write.
- No `any` in TypeScript; describe types so payloads are checked at the boundary.
