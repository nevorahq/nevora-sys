# Finance standalone runtime

This workspace is the independently buildable and deployable Next.js runtime
for the Finance (Money) product boundary, mirroring `apps/tasks` and
`apps/subscriptions`.

Current state:

- DTOs, schemas and pure helpers come from `@nevora/finance-contracts`;
- the authenticated port and wire protocol come from `@nevora/finance-api`;
- Supabase queries and mutations come from `@nevora/finance-runtime`;
- `POST /api/internal/finance` accepts only HMAC-signed, short-lived service
  claims (`nfs1.` prefix) bound to one operation;
- organization, workspace, membership and the relevant live role permissions
  are revalidated before the service-role client is used;
- health and configuration-aware readiness endpoints are available;
- the runtime never imports the root application's `@/` aliases.

Unlike `apps/subscriptions`, this deployment needs **no cross-product
connectivity**: `createMoneyAccount` (the port's only mutation) emits no
domain events or audit logs and never calls another product — confirmed by
reading `modules/moneyflow/services/money-account-service.ts` before porting
it (see `docs/adr/001-product-module-boundaries.md`). The request handler
wires `@nevora/finance-runtime` directly, with no `effects.ts` or
cross-service client to maintain.

Run locally:

```bash
cp apps/finance/.env.example apps/finance/.env.local
npm run dev:finance
```

Set the server-only runtime variables `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `FINANCE_SERVICE_AUTH_SECRET` (the same
secret the root caller uses).

Do not replace `SUPABASE_URL` with a `NEXT_PUBLIC_` variable. Next.js freezes
public variables during `next build`, which would make the same promoted image
point to its build environment instead of the runtime environment.

Build the standalone artifact with `npm run build:finance`. The root
application can then be cut over without caller changes via
`FINANCE_TRANSPORT=shadow`, `http-read`, and finally `http`;
`FINANCE_API_URL` points to this deployment and `in-process` remains the
rollback switch. See `docs/runbooks/finance-cutover.md` for gates and
rollback rules — the procedure mirrors `docs/runbooks/tasks-cutover.md` and
`docs/runbooks/subscriptions-cutover.md`, one operation vocabulary swapped
for the other.

For a provider-neutral container deployment, build from the repository root:

```bash
docker build -f apps/finance/Dockerfile -t nevora-finance .
docker run --rm -p 3003:3003 \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e FINANCE_SERVICE_AUTH_SECRET \
  nevora-finance
```

The final image runs the Next.js standalone server as the unprivileged
`nextjs` user. `/api/health` is the container liveness check;
`/api/ready` is the deployment readiness gate and verifies database access.

## Netlify staging

The Finance runtime can also be deployed as a separate Netlify Next.js site,
the same way as Tasks and Subscriptions. Create the site from the same
repository with these monorepo settings:

- base directory: repository root (`/`);
- package directory: `apps/finance`;
- configuration file: `apps/finance/netlify.toml`;
- production branch: `main`.

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`FINANCE_SERVICE_AUTH_SECRET` in the Finance site's runtime environment. Use
`/api/health` for liveness and `/api/ready` for readiness after the variables
are configured. The root site receives the generated Finance site URL through
`FINANCE_API_URL` and must use the same `FINANCE_SERVICE_AUTH_SECRET`.

## Not built yet (unlike `apps/tasks`)

`apps/tasks` additionally has a manual GitHub Actions workflow that publishes
a checked, immutable image to GHCR, a `deploy/tasks/` staging compose
definition, and `canary:tasks` / `rehearse:tasks` / `smoke:tasks` operator
scripts. None of those exist yet for Finance (or Subscriptions) — building
them requires real infrastructure decisions (registry naming, staging host,
secrets) that belong to whoever actually stands this deployment up. Docker
build/run and the Netlify site settings above work today without them.

## Deliberately scoped out of the port entirely

Two Money subsystems don't go through this deployment at all yet, not because
they were forgotten but because they're meaningfully larger, distinct
sub-domains deferred to a later increment (see the ADR): the Zod validation
schemas in `modules/moneyflow/schemas/*`, and the expense-classification
engine (`classifyExpense`/`upsertPrivateMerchantRule`/`getExpenseContexts` in
`modules/moneyflow/services/expense-classifier.ts`). `modules/review` still
calls the classifier in-process directly.
