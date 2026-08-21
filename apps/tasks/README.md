# Tasks standalone runtime

This workspace is the independently buildable and deployable Next.js runtime
for the Tasks product boundary.

Current state:

- DTOs, schemas and pure helpers come from `@nevora/tasks-contracts`;
- the authenticated port and wire protocol come from `@nevora/tasks-api`;
- Supabase queries, mutations and infrastructure effects come from
  `@nevora/tasks-runtime`;
- `POST /api/internal/tasks` accepts only HMAC-signed, short-lived service
  claims bound to one operation;
- organization, workspace, membership and the relevant live role permissions
  are revalidated before the service-role client is used;
- health and configuration-aware readiness endpoints are available;
- the runtime never imports the root application's `@/` aliases and no longer
  proxies execution back to the root deployment.

Run locally:

```bash
cp apps/tasks/.env.example apps/tasks/.env.local
npm run dev:tasks
```

Set the server-only runtime variable `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and the same
`TASKS_SERVICE_AUTH_SECRET` used by the root caller. Apply migration 114 before
enabling remote writes so standard task creation can reserve `tasks.count`
atomically.

Do not replace `SUPABASE_URL` with a `NEXT_PUBLIC_` variable. Next.js freezes
public variables during `next build`, which would make the same promoted image
point to its build environment instead of the runtime environment.

Build the standalone artifact with `npm run build:tasks`. Before changing live
traffic, run `npm run canary:tasks` with the target URL and a known tenant
context. The root application can then be cut over without caller changes via
`TASKS_TRANSPORT=shadow`, `http-read`, and finally `http`;
`TASKS_API_URL` points to this deployment and `in-process` remains the rollback
switch. See `docs/runbooks/tasks-cutover.md` for gates and rollback rules.

Validate the exact standalone server locally after a build:

```bash
npm run smoke:tasks
```

The smoke test assembles `.next/static` beside the traced server and verifies
liveness, fail-closed readiness, static assets and the hidden RPC boundary.

With local Supabase running, exercise the complete database-backed release path:

```bash
supabase start
docker build -f apps/tasks/Dockerfile -t nevora-tasks:local .
npm run rehearse:tasks
```

The rehearsal idempotently applies migration 114, restores hosted-like
service-role grants only in the local database, creates a disposable tenant,
checks signed writes/reads and usage compensation, then removes all fixtures.

For a provider-neutral container deployment, build from the repository root:

```bash
docker build -f apps/tasks/Dockerfile -t nevora-tasks .
docker run --rm -p 3001:3001 \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e TASKS_SERVICE_AUTH_SECRET \
  nevora-tasks
```

The final image runs the Next.js standalone server as the unprivileged
`nextjs` user. `/api/health` is the container liveness check;
`/api/ready` is the deployment readiness gate and verifies database access.

The GitHub Actions workflow `Publish Tasks staging image` is intentionally
manual. It publishes `ghcr.io/nevorahq/nevora-tasks:sha-<full-commit>` only after
starting and checking the image, then updates the convenience `staging` alias.
Deploy the immutable sha tag from the workflow summary. A portable staging
definition and environment template live under `deploy/tasks/`.
