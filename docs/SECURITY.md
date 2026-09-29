# Security — Nevora Business OS

> Security-first is a hard constraint, not a phase. RLS is the **primary** tenant
> boundary; application-level `.eq()` filters are defense-in-depth only. See
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the rules.

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
[ ] Service role only as allowed in ARCHITECTURE.md (session-less surface or listed exception)
[ ] No client-trusted organization_id / workspace_id (taken from requireOrg())
[ ] No raw SQL interpolation
[ ] Critical action creates an audit log
[ ] Important business action emits a domain event
[ ] New machine-facing route (webhook, cron, internal) verifies its caller and is in MACHINE_ROUTES
[ ] Nothing outside Money inserts into money_transactions
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
  - **public (`anon`)**: only token-resolving functions (`get_invite_info`) —
    they never accept internal ids from the client. The public booking RPCs
    (`create_booking_request_public`, `check_client_booking_conflict_public`)
    had their `anon` EXECUTE revoked by migration `098` while Booking is paused;
    un-pausing must restore it deliberately.
  - **authenticated-only**: provisioning + membership RPC
    (`create_organization`, `invite_member`, `accept_invite`, …).
  - **service_role-only**: `check_rate_limit`, and the service-identity usage
    RPCs used by `apps/tasks` (`114`) and channel uploads (`122`) — each repeats
    the membership check itself.
  - **internal-only**: trigger functions and provisioning helpers (EXECUTE
    revoked from clients).
  - **RLS helpers** (`is_org_member`, …) stay callable by `anon`/`authenticated`
    because they run inside RLS expressions.

## Rate limiting

- A **Postgres-backed** rate limiter (`lib/rate-limit/`, migrations `036`/`038`)
  works in serverless/multi-instance environments with no external paid
  service. Today it guards only the public booking endpoints, which are paused
  and answer 404.
- The write RPC `check_rate_limit` is **service_role only**; the public client
  cannot call it. `limit`/`window` are allow-listed per bucket in SQL (not set by
  the client). `identifier` is a SHA-256 hex of `IP (+ org slug)` — raw IP / email
  / phone are never stored or logged. On exceed: `429` + `Retry-After`.

## Machine-facing surfaces

Every route that runs without a user session authenticates its caller before
doing any work, and must be listed in `MACHINE_ROUTES`
(`shared/config/routes.ts`) — otherwise `proxy.ts` redirects it to `/login`.

| Surface | Caller check |
| --- | --- |
| `/api/cron/*` | `Authorization: Bearer CRON_SECRET` — 503 if unset, 401 if wrong |
| `/api/internal/{activation-funnel,job-health}` | `Bearer METRICS_SECRET` (distinct from `CRON_SECRET`) |
| `/api/internal/{tasks,subscriptions,finance}` | HMAC service claims (`nts1.` / `nss1.` / `nfs1.`), bound to one operation, short-lived; live membership re-checked |
| `/api/channels/telegram/webhook` | `X-Telegram-Bot-Api-Secret-Token` = `TELEGRAM_WEBHOOK_SECRET`; sender must be a linked account |
| `/api/channels/slack/*` | Slack signing secret; OAuth `state` bound to an httpOnly cookie, user and organization |
| `/api/channels/email/inbound` | Svix signature (`RESEND_INBOUND_WEBHOOK_SECRET`); sender must be the account owner, unknown senders dropped |
| `/api/billing/webhook` | Paddle `ts=…;h1=…` signature; paid plans activate only here |

Channel traffic is unauthenticated input that reaches an AI call, so the AI
request is metered **before** the model is called (`capture_intent`, migration
`119`; `voice_transcription`, `124` — a transcription the provider could not run
returns its unit).

## Secrets & service role

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. It is allowed on session-less
  surfaces (cron, the webhooks above, internal service routes) and on the short
  list of in-session exceptions in [`ARCHITECTURE.md`](./ARCHITECTURE.md), always
  scoped to a verified organization/user. A new use must extend that list.
- `CRON_SECRET` is **required and fail-closed** for every `/api/cron/*` route
  (Bearer auth). Generate with `openssl rand -hex 32`.
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, channel secrets,
  `GMAIL_TOKEN_ENCRYPTION_KEY` and Paddle secrets are server-only; never expose
  them to the client. Only `NEXT_PUBLIC_*` values reach the browser. Gmail OAuth
  tokens are stored encrypted.
- `.env.example` carries placeholders only — never a real key, not even a
  test-mode one. Paddle placeholders use obvious non-secret samples such as
  `pdl_sdbx_your_api_key`, `pdl_ntfset_your_notification_destination_secret`,
  and `pri_your_*_price_id`.

### Legacy payment test key — 2026-07-08 finding

A real legacy payment-provider **test-mode** secret key was found inside this
repository's local git object store. The value is deliberately not reproduced
here. Scope, established by scanning every object and every remote ref:

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
   A real legacy payment test key was removed from `.env.example`.
2. **Rotate the key in the provider dashboard anyway.** It is a real credential
   of a real account and it sat unencrypted on disk. Rotation is cheap;
   assurance is not.
3. Never place a live value in `.env.example`, including test-mode keys.

Rotation is still owed and tracked as **I-07** in
[`release/p0-p1-issue-register.md`](./release/p0-p1-issue-register.md) — a
public-launch blocker. Recurrence is guarded by gitleaks in CI and the
pre-commit hook (see `DEVELOPMENT.md`).

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
