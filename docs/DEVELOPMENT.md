# Development — Nevora Business OS

How to run, verify, and extend the project. Package manager: **npm**.

> **Next.js 16 caveat:** APIs and conventions differ from older Next.js. Read the
> local docs in `node_modules/next/dist/docs/` before changing Next internals.
> Middleware is renamed to **proxy** (`proxy.ts` at the repo root). See `AGENTS.md`.

## Running the project

```bash
npm install                  # install deps (fonts are self-hosted via @fontsource)
cp .env.example .env.local   # fill in Supabase creds (see below)
npm run dev                  # http://localhost:3000
```

Fonts ship as `@fontsource` packages and are bundled at build time — no internet
needed for fonts during build (important for CI/offline).

## Environment variables

Copy `.env.example` → `.env.local`. `lib/env.ts` validates the required public
vars at import time (fail-fast): without them the app and `next build` will not
start.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (validated as URL). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | rate-limit / cron | Server-only. Rate limiter + extraction sweep. Unset → fail-open no-op. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | email | Transactional email (verified sender). |
| `ANTHROPIC_API_KEY` | AI / extraction | AI module + document-to-transaction OCR. |
| `DOCUMENT_EXTRACTION_MOCK` | local | `1`/`true` stubs AI extraction (no credits). |
| `CRON_SECRET` | cron | Required, fail-closed, for `/api/cron/extraction-sweep`. |
| `RUN_DB_TESTS` | tests | `1` enables the opt-in DB integration test (local DB only). |
| `TASKS_TRANSPORT` | Tasks extraction | `in-process`, `shadow`, `http-read`, or `http`. |
| `TASKS_API_URL` | Tasks HTTP | Optional Tasks service origin; falls back to app URL/request host. |
| `TASKS_SERVICE_AUTH_SECRET` | Tasks machine calls | 32+ character secret for short-lived, operation-bound service claims. |
| `TASKS_SHADOW_READ_PERCENT` | Tasks canary | Percentage of reads compared remotely in `shadow` mode; default `100`. |

## Verifying changes

```bash
npm run typecheck   # next typegen + tsc --noEmit
npm run typecheck:packages # independently check workspace packages/apps
npm run lint        # ESLint (eslint-config-next, typescript)
npm test            # Vitest (business logic, permissions, route matching)
npm run build       # production build
npm run build:tasks # standalone Tasks runtime
npm run smoke:tasks # run the built Tasks server and verify deployment invariants
npm run rehearse:tasks # local Supabase + container + signed write/read integration
npm run canary:tasks # health, readiness, signed read and optional parity check
```

The manual `Publish Tasks staging image` GitHub workflow builds and validates
the container before publishing it to GHCR. Staging hosts must deploy the
immutable `sha-<full-commit>` tag with `deploy/tasks/compose.staging.yml`; the
mutable `staging` alias is for discovery only, not rollback-safe deployment.

CI runs the same sequence on every push/PR to `main`
(`.github/workflows/ci.yml`): install → `next typegen` → typecheck → lint →
test → root build → Tasks build. Run these locally before pushing.

> `next typegen` generates Next 16 typed-route globals (PageProps/RouteContext)
> into `.next/dev/types`. They don't exist on a fresh checkout, so `typecheck`
> runs typegen first — otherwise `tsc` fails on a clean tree.

## Workspace extraction layout

The production Next.js application remains at the repository root while domain
boundaries are extracted incrementally into npm workspaces:

```text
apps/tasks/                  # independently deployable Tasks Next.js shell
packages/tasks-api/          # authenticated read/write port definitions
packages/tasks-contracts/    # portable Tasks DTOs, schemas, constants, helpers
packages/tasks-runtime/      # shared Supabase queries, mutations and effects
packages/financial-state/    # shared financial-state contract and UI badge
```

`apps/tasks` builds as a standalone Next.js application and executes the strict
Tasks RPC locally. The `@nevora/tasks-runtime` package owns the shared Supabase
queries, mutations, quota effects, events and audit writes; both root
compatibility adapters and the standalone deployment use this implementation.
Boundary tests and ESLint prevent either runtime from reaching through the
other application's aliases.

Cross-module server callers obtain a bound `TasksApplication` from
`platform/tasks/server.ts`. The adapter derives organization, workspace, actor
and permission scopes from `CurrentContext`; API method payloads cannot select a
tenant. Product-internal routes may continue to use the Tasks public server
entrypoint until the UI shell is moved.

Point `TASKS_API_URL` at the standalone service and progress through
`shadow` → `http-read` → `http`. The root caller signs every request with a
60-second `TASKS_SERVICE_AUTH_SECRET` claim; no browser session cookie crosses
the product-service boundary. The claim is bound to one RPC operation and
cannot select another tenant through its payload. The Tasks runtime verifies
signature, expiry, operation and permission, then revalidates the actor's live
organization, workspace, membership and role-derived permission before local
Supabase execution. Invalid or missing credentials fail closed.

Run the standalone runtime separately at `http://localhost:3001` with:

```bash
cp apps/tasks/.env.example apps/tasks/.env.local
npm run dev:tasks
```

Fill all three variables from `apps/tasks/.env.example` and apply migration 114
before enabling writes. Keep `TASKS_TRANSPORT=in-process` as the instant
rollback switch during rollout.

The cutover modes deliberately treat reads and writes differently:

- `shadow`: local reads/writes stay authoritative; sampled remote reads are
  compared and emit `tasks.cutover.read` structured logs;
- `http-read`: reads use Tasks with safe local fallback; writes remain local;
- `http`: reads still fall back locally, while writes go remote and never retry
  locally after a timeout because the remote write may already have committed.

See `docs/runbooks/tasks-cutover.md` for gates and rollback criteria.

The root application consumes workspace sources through package exports.
`next.config.ts` lists UI/source packages in `transpilePackages`, as required for
local monorepo packages. Compatibility facades remain at the old module paths
only to keep internal migration reversible; new consumers must use workspace
package imports.

## Working with Supabase

SQL migrations live in `supabase/migrations/` and apply in numeric order.
Each describes schema, RLS policies, SECURITY DEFINER RPC, indexes and grants.

```bash
supabase start            # local Postgres + Auth (Docker)
supabase db reset         # apply all migrations from supabase/migrations/
supabase migration new <name>   # create the next NNN_*.sql file
```

- **Never edit an already-applied migration.** New schema changes are a new file
  with the next number (`068_*.sql`, …) — numeric prefix, not date prefix.
- One migration carries table + indexes + RLS policies + grants together.
- Make migrations idempotent (`IF NOT EXISTS` / `IF EXISTS`).
- Do **not** apply migrations to the remote project from local dev without
  explicit coordination.

## Adding a new module

Modules are vertical slices under `modules/<name>/`. Product modules expose
environment-specific public entrypoints so a Client Component cannot
accidentally pull server-only code into its module graph:

```
modules/<name>/
├── contracts.ts    # types, constants, schemas, pure helpers
├── server.ts       # server-only queries and services
├── actions.ts      # public async Server Function wrappers
├── ui.ts           # React components
├── index.ts        # temporary compatibility facade for older modules
├── actions/        # "use server" Server Actions (mutations) + tests
├── queries/        # server-only read queries
├── services/       # pure domain logic (unit-tested)
├── schemas/        # Zod schemas for input validation
├── components/     # module-owned UI
├── constants/      # statuses, labels, config
└── types/          # domain types (no `any`)
```

Code outside the product imports only one of the explicit entrypoints:

```ts
import type { TaskStatus } from "@nevora/tasks-contracts";
import { getTaskById } from "@/modules/tasks/server";
import { changeTaskStatusAction } from "@/modules/tasks/actions";
import { TaskActivity } from "@/modules/tasks/ui";
```

Do not import `@/modules/<product>/queries/...`, `/services/...`,
`/components/...` or `/actions/...` from outside that product. ESLint enforces
this rule for Tasks, Money and Subscriptions. Internal files may keep relative
or local deep imports. See `docs/adr/001-product-module-boundaries.md`.

Portable Tasks types, schemas, constants and pure key helpers are the exception
to the root entrypoint convention: import them from `@nevora/tasks-contracts`.

Tasks, Money and Subscriptions also do not import one another. Put shared,
product-neutral contracts and service ports under `platform/`; put UI or server
orchestration that combines products under `workflows/`:

```text
platform <- modules/{tasks,moneyflow,subtracker} <- workflows <- app routes
```

For example, `workflows/financial-obligations/ui.tsx` supplies Money's account
prompt to task/subscription panels through a neutral composition slot.
Its `actions.ts` and `server.ts` entrypoints own cross-product payment mutations;
product components receive those mutations as callbacks. Do not call the
`mark_financial_task_paid` or `mark_subscription_payment_paid` RPC directly from
a product module—ESLint treats that as a boundary violation.

Database-table ownership follows the same rule. Tasks owns `todos`, Money owns
`money_*`, and Subscriptions owns `subscriptions` plus
`subscription_payment_cycles`. Cross-product lifecycle calls use the transport
seams under `platform/task-lifecycle` and `platform/financial-obligations`.

- **Business logic lives in `modules/`**, not in `app/page.tsx` (routing only)
  and not in `shared/` (reusable infra/UI only).
- Pages read data in Server Components and pass it down; client components
  (`"use client"`) only for interactivity (`useActionState`, toggles).

## Authoring Server Actions

```ts
"use server";
export async function doThingAction(
  _prev: ActionResult, formData: FormData,
): Promise<ActionResult> {
  const { user, org, workspace } = await requireOrg();   // context from session
  const parsed = schema.safeParse(raw);                  // Zod validation
  if (!parsed.success) return { fieldErrors: ... };
  // permission check → insert/update → emitDomainEvent(...) → revalidatePath(...)
}
```

- Mutations are Server Actions, **not** `app/api/` routes (routes are for
  public/internal/webhook/cron surfaces only).
- Take `organization_id`/`workspace_id` from `requireOrg()` — never from the client.
- Validate every input with Zod; never interpolate raw SQL.
- Emit a `domain_event` for meaningful changes; create an audit log for critical ones.

## Secret scanning

A real test-mode payment key once reached this repository's local git object
store (I-03/I-07). `.gitignore` and GitHub push protection guard the *remote*;
nothing guarded the moment of `git add`. Now something does.

Install the tool, then enable the hook — once per clone:

```bash
brew install gitleaks     # or: https://github.com/gitleaks/gitleaks#installing
npm run hooks:install     # sets core.hooksPath=.githooks
```

The hook scans **staged** changes and blocks the commit on a finding, before
anything becomes a git object. It is deliberately **not** silent when gitleaks
is missing — it fails and tells you to install it, because a hook that reports
success it never checked is worse than no hook. To bypass it you have to say so
out loud: `SKIP_GITLEAKS=1 git commit ...`.

Scan by hand:

```bash
npm run scan:secrets          # whole history
npm run scan:secrets:staged   # what you are about to commit
```

CI runs the same history scan on every PR (`secrets` job), with the binary
pinned and checksum-verified. Findings are always `--redact`ed: a secret must
never be printed into a public CI log.

Never allowlist a whole path in `.gitleaks.toml` to silence a false positive —
that also hides a real key added to the same file later. Allowlist the specific
finding by fingerprint.

## Security before a PR

Run through the checklist in [`SECURITY.md`](./SECURITY.md): RLS enabled,
`WITH CHECK` on insert/update, permission check on the mutation, Zod validation,
no service role in app logic, no client-trusted ids, no raw SQL interpolation.

## More documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — target architecture and hard rules.
- [`MODULE_STATUS.md`](./MODULE_STATUS.md) — honest per-module status.
- [`ROADMAP.md`](./ROADMAP.md) — phases, starting at Phase 0.
- [`PRODUCT_COPY.md`](./PRODUCT_COPY.md) — positioning and landing copy.
- [`SECURITY.md`](./SECURITY.md) — security checklist and tenant isolation.
- [`nevora-architect-prompt.md`](./nevora-architect-prompt.md) — architect system prompt.
- [`automation-foundation.md`](./automation-foundation.md),
  [`money-upcoming-expenses.md`](./money-upcoming-expenses.md) — design notes.
