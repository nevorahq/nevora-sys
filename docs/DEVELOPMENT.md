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

## Verifying changes

```bash
npm run typecheck   # next typegen + tsc --noEmit
npm run lint        # ESLint (eslint-config-next, typescript)
npm test            # Vitest (business logic, permissions, route matching)
npm run build       # production build
```

CI runs the same sequence on every push/PR to `main`
(`.github/workflows/ci.yml`): install → `next typegen` → typecheck → lint →
test → build. Run these locally before pushing.

> `next typegen` generates Next 16 typed-route globals (PageProps/RouteContext)
> into `.next/dev/types`. They don't exist on a fresh checkout, so `typecheck`
> runs typegen first — otherwise `tsc` fails on a clean tree.

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

Modules are vertical slices under `modules/<name>/` with a public `index.ts`:

```
modules/<name>/
├── index.ts        # public API surface (only import this from app/features)
├── actions/        # "use server" Server Actions (mutations) + tests
├── queries/        # server-only read queries
├── services/       # pure domain logic (unit-tested)
├── schemas/        # Zod schemas for input validation
├── components/     # module-owned UI
├── constants/      # statuses, labels, config
└── types/          # domain types (no `any`)
```

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
