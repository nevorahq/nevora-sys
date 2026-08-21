# Subscriptions standalone runtime

This workspace is the independently buildable and deployable Next.js runtime
for the Subscriptions product boundary, mirroring `apps/tasks`.

Current state:

- DTOs, schemas and pure helpers come from `@nevora/subscriptions-contracts`;
- the authenticated port and wire protocol come from `@nevora/subscriptions-api`;
- Supabase queries, mutations and read logic come from `@nevora/subscriptions-runtime`;
- provisioning a payment task calls the Tasks service over HTTP
  (`src/tasks-client.ts` + `src/effects.ts`) — `todos` is Tasks-owned, and this
  is a separate deployment with no in-process path to it;
- `POST /api/internal/subscriptions` accepts only HMAC-signed, short-lived
  service claims (`nss1.` prefix) bound to one operation;
- organization, workspace, membership and the relevant live role permissions
  are revalidated before the service-role client is used;
- health and configuration-aware readiness endpoints are available;
- the runtime never imports the root application's `@/` aliases.

Run locally:

```bash
cp apps/subscriptions/.env.example apps/subscriptions/.env.local
npm run dev:subscriptions
```

Set the server-only runtime variables `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `SUBSCRIPTIONS_SERVICE_AUTH_SECRET` (the same
secret the root caller uses). Also set `TASKS_API_URL` and
`TASKS_SERVICE_AUTH_SECRET` — this deployment calls the Tasks service to
provision payment tasks, so it needs the same Tasks connectivity `apps/tasks`
itself uses.

Do not replace `SUPABASE_URL` with a `NEXT_PUBLIC_` variable. Next.js freezes
public variables during `next build`, which would make the same promoted image
point to its build environment instead of the runtime environment.

Build the standalone artifact with `npm run build:subscriptions`. The root
application can then be cut over without caller changes via
`SUBSCRIPTIONS_TRANSPORT=shadow`, `http-read`, and finally `http`;
`SUBSCRIPTIONS_API_URL` points to this deployment and `in-process` remains the
rollback switch. See `docs/runbooks/subscriptions-cutover.md` for gates and
rollback rules — the procedure mirrors `docs/runbooks/tasks-cutover.md`
exactly, one operation vocabulary swapped for the other.

For a provider-neutral container deployment, build from the repository root:

```bash
docker build -f apps/subscriptions/Dockerfile -t nevora-subscriptions .
docker run --rm -p 3002:3002 \
  -e SUPABASE_URL \
  -e SUPABASE_SERVICE_ROLE_KEY \
  -e SUBSCRIPTIONS_SERVICE_AUTH_SECRET \
  -e TASKS_API_URL \
  -e TASKS_SERVICE_AUTH_SECRET \
  nevora-subscriptions
```

The final image runs the Next.js standalone server as the unprivileged
`nextjs` user. `/api/health` is the container liveness check;
`/api/ready` is the deployment readiness gate and verifies database access.

## Netlify staging

The Subscriptions runtime can also be deployed as a separate Netlify Next.js
site, the same way as Tasks. Create the site from the same repository with
these monorepo settings:

- base directory: repository root (`/`);
- package directory: `apps/subscriptions`;
- configuration file: `apps/subscriptions/netlify.toml`;
- production branch: `main`.

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUBSCRIPTIONS_SERVICE_AUTH_SECRET`, `TASKS_API_URL` and
`TASKS_SERVICE_AUTH_SECRET` in the Subscriptions site's runtime environment.
Use `/api/health` for liveness and `/api/ready` for readiness after the
variables are configured. The root site receives the generated Subscriptions
site URL through `SUBSCRIPTIONS_API_URL` and must use the same
`SUBSCRIPTIONS_SERVICE_AUTH_SECRET`.

## Not built yet (unlike `apps/tasks`)

`apps/tasks` additionally has a manual GitHub Actions workflow that publishes
a checked, immutable image to GHCR, a `deploy/tasks/` staging compose
definition, and `canary:tasks` / `rehearse:tasks` / `smoke:tasks` operator
scripts. None of those exist yet for Subscriptions — building them requires
real infrastructure decisions (registry naming, staging host, secrets) that
belong to whoever actually stands this deployment up, not something to
presume. Docker build/run and the Netlify site settings above work today
without them; add the automation layer the same way Tasks got it, when there
is a real target to deploy to.
