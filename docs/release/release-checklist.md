# Release Checklist — Nevora Business OS

**Status:** Canonical · **Last updated:** 2026-09-29 (tree `000`–`125`, applied on remote; host Netlify)
**Supersedes:** [`phase-7-release-checklist.md`](./phase-7-release-checklist.md)
(kept for history; its migration section stops at 077 and is stale)

Run top-to-bottom before deploying. Do not skip §2 (migrations) or §3 (scope gate).

**Release line:** `main`. Netlify deploys production on every merge to `main`
(site `nevora-business-os`); CI (`verify`, `db`, `secrets`) must be green on the
merge commit.

**Latest safety-gate evidence:**
[`launch-readiness-2026-07-22.md`](./launch-readiness-2026-07-22.md) (safety gate
verified, activation gate pending).

**Earlier smoke/verdict evidence (2026-07-09, commit `bb9c486`):**
[`release-evidence-2026-07-09.md`](./release-evidence-2026-07-09.md) (verdict:
**Private Beta Ready**, public launch No-Go) ·
[`smoke-test-report-2026-07-09.md`](./smoke-test-report-2026-07-09.md) (partial —
interactive flows NOT EXECUTED) ·
[`smoke-test-report-2026-07-09-paddle.md`](./smoke-test-report-2026-07-09-paddle.md)
(post-merge local run on `331f154`/`676b73b`: unauthenticated surface all PASS,
interactive flows still NOT EXECUTED) ·
[`p0-p1-issue-register.md`](./p0-p1-issue-register.md) (P0/P1 closed; I-07 key
rotation + I-09 interactive smoke still open).

---

## 0. Migration baseline

| | |
|---|---|
| **Current baseline (tree)** | `000` – `125` (no duplicate prefixes; `054` is a known, intentional gap) |
| **Next free number** | **`126`** |
| **Remote state** | `000`–`125` applied on `uimpykbnatzhykzpastd` (`125` confirmed 2026-09-29 by probing `capture_project_rules`; `114` confirmed 2026-09-23; `115`–`124` applied by the maintainer 2026-08-22 → 2026-09-29). Earlier: `000`–`105` confirmed 2026-07-13 (`105` = inbox universal-capture idempotency); `106`–`109` (multilingual + FX) applied 2026-07-16 (PR #46); `110`–`111` (job-health indexes + durable notification history) applied 2026-07-22 (PR #55); `112` (usage-discrepancy audit table) applied 2026-07-22. |
| **`098` status** | Applied. Anon can no longer read booking tables or EXECUTE the public booking RPCs (verified with the public anon key). |
| **`099` status** | Applied. `todos.source_suggestion_id` + the four exactly-once indexes are live; the migration went in before the app deploy that writes the column. |
| **`100`/`101` status** | Applied. `100` enforces the Paddle-only billing provider boundary; `101` fixes it to still allow the internal `'manual'` default so `create_organization` does not roll back. |
| **`102`–`105` status** | Applied (per migration-baseline verification 2026-07-13). `102`/`103` = auth-user-delete FK safety; `104` = `account_deletion_requests` (self-service deletion); `105` = inbox universal-capture idempotency. |
| **`106`–`109` status** | Applied (user-confirmed 2026-07-16, PR #46). `106` widens the `language` CHECK to allow `'ro'`; `107` adds `organization_exchange_rates` + cross-currency transfer RPC (re-verified present on remote 2026-07-21); `108`/`109` fix `create_money_transfer` runtime errors (42702/42703). |
| **`110` status** | Applied (2026-07-22). Partial indexes for the cross-org job-health status/time-window counts. |
| **`111` status** | Applied (2026-07-22). `process_due_reminders` now always materializes the action item + in-app notification for a due reminder; category mutes gate only the disruptive channels, not durable history. |
| **`112` status** | Applied (2026-07-22). `usage_reconciliation_discrepancies` audit table (service-role only, RLS on / no policy). The usage-reconcile sweep writes to it best-effort. |
| **`113` status** | **Applied 2026-07-23 (maintainer-confirmed, and independently verified: the `workspaces.slug` COMMENT that only `113` sets is present on remote via the PostgREST OpenAPI description).** A NO-OP on remote by design — Repairs drift found 2026-07-23 by running the opt-in integration test against a database rebuilt from this tree: `workspaces.slug` was missing (so `create_organization()` failed) and `money_accounts.user_id` was `NOT NULL` while no code sets it (so every account insert failed). Remote already has the slug column and no `user_id` column, so applying it changes nothing there — its value is that staging / DR / CI can rebuild a WORKING database. Proof: `supabase/tests/113_schema_drift_repair_verification.sql` actually calls `create_organization()` and inserts an account inside a rolled-back transaction; it FAILS without `113`. |
| **`114`–`125` status** | Applied. `114` Tasks service usage RPCs; **`115` destructive** — drops Financial Tasks columns and the `mark_*_paid` RPCs (no app rollback may cross it); `116` Gmail import; `117`/`118` renewal decisions + reminders; `119` `capture_intent` AI quota; `120` `documents.capture_code`; `121`–`123` channel intake; `124` `voice_transcription` quota; `125` capture project rules. |
| **Phase A schema change** | **None.** Phase A is code + docs only. |
| **Phase B–D schema change** | `094` (planner confirmation), `095` (onboarding progress), `096` (Phase D commercial readiness), `097` (documents↔money↔subscriptions). |
| **Paddle billing schema change** | `100` (Paddle-only billing boundary), `101` (fix boundary to allow internal `'manual'` provider). |
| **Account deletion schema change** | `102`/`103` (auth-user-delete FK safety), `104` (`account_deletion_requests`). |
| **Multilingual + FX schema change** | `106` (Romanian `language` CHECK), `107` (`organization_exchange_rates` + cross-currency transfers), `108`/`109` (`create_money_transfer` fixes). |

> ⚠️ This table has gone stale **four times**: at "000–086, next 087", at
> "000–093, next 094" (which also wrongly claimed "93 files, no gaps" — `054` is
> absent), at "000–101, next 102" (the tree had reached `109`), and at "000–113,
> next 114" (the tree had reached `125`). **Do not reintroduce any of them.** Verify against
> the tree, not against a doc:
>
> ```sh
> ls supabase/migrations | tail -1                          # highest file
> ls supabase/migrations | sed 's/_.*//' | sort | uniq -d    # must be empty
> ```

### Migrations to confirm on remote before release

Confirm by probing the *object*, not by trusting notes. Presence of the table or
column is proof; a `PGRST202` from an RPC probe only means "no function with that
arity" and is **not** proof of absence.

| Migration | Confirm this object exists | Verified 2026-07-08 |
|---|---|---|
| `078` Subscription Payment Workflow | table `subscription_payment_cycles` (its RPC was dropped in `115`) | ✅ |
| `079` Financial Context Tasks | superseded — `115` dropped these `todos` columns | — |
| `080` Capture Inbox | tables `planner_entries`, `planner_suggestions` | ✅ |
| `086` Trial Reuse Protection | table `billing_trial_claims` | ✅ |
| `089` Trial Identity Hardening | table `billing_identities`; RPC `get_organization_access_state` | ✅ |
| `092` Billing Provider Boundary | table `billing_provider_events` | ✅ |
| `093` Analytics Writability | table `analytics_reports`; RPC `can_write_data` | ✅ |
| `100` Paddle-only billing boundary | `billing_subscriptions` provider CHECK constraint | ✅ (2026-07-09) |
| `101` Fix Paddle boundary (allow `manual`) | `create_organization` succeeds with default `'manual'` provider | ✅ (2026-07-09) |
| `104` Account deletion requests | table `account_deletion_requests` | ✅ (2026-07-13) |
| `105` Inbox universal-capture idempotency | idempotency index on `planner_entries` | ✅ (2026-07-13) |
| `107` Org FX rates + cross-currency transfers | table `organization_exchange_rates` | ✅ (2026-07-21) |
| `106`/`108`/`109` Multilingual + FX fixes | `language` CHECK allows `'ro'`; `create_money_transfer` runs without 42702/42703 | ✅ (maintainer-confirmed 2026-07-21) |
| `114` Tasks service usage | RPC `reserve_tasks_usage_for_service` (service_role) | ✅ (2026-09-23) |
| `115` Remove Financial Tasks | `todos.financial_status` **absent** — `select=financial_status` → 400 while `select=id` → 200 | ✅ (2026-09-29) |
| `116` Gmail invoice import | tables `gmail_connections`, `gmail_invoice_imports` | ✅ (2026-09-29) |
| `117` Renewal decision inbox | table `subscription_renewal_cases` | ✅ (2026-09-29) |
| `121` Channel intake | tables `channel_integrations`, `channel_link_codes`; `planner_entries.channel` | ✅ (2026-09-29) |
| `125` Capture project rules | table `capture_project_rules`; `planner_entries.channel_signals` | ✅ (2026-09-29) |

Migrations are applied **manually** by the maintainer (the Supabase CLI is not
logged in). See `docs/runbooks/rollback.md` before applying anything irreversible.

---

## 1. Environment variables (verify in Netlify, context *Production*, scopes *functions* + *runtime*)

A changed variable reaches the site only with a **new deploy** — set it, then
trigger a redeploy.

| Var | Purpose | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client auth | public |
| `SUPABASE_SERVICE_ROLE_KEY` | background jobs only | **secret**, server only |
| `CRON_SECRET` | protects all cron routes | **secret**; missing ⇒ crons fail closed |
| `ANTHROPIC_API_KEY` | document extraction OCR | **secret**; billed |
| `DOCUMENT_EXTRACTION_MOCK` | mock OCR in non-prod | **must be unset/false in prod** |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | invite / notification email | secret + verified sender |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | web push | keypair matched |
| `BILLING_MODE` | billing runtime mode | `private_beta` until Paddle smoke passes |
| `BILLING_PROVIDER` | provider selector | `paddle` only |
| `PADDLE_ENV` | Paddle environment | `sandbox` for smoke, `production` for live |
| `PADDLE_API_KEY` | Paddle API access | **secret**, server only; required for paid modes |
| `PADDLE_WEBHOOK_SECRET` | Paddle webhook signature | **secret**, server only; required for paid modes |
| `PADDLE_CLIENT_TOKEN` | Paddle client token | public-ish token; set only when checkout flow needs it |
| `PADDLE_PRICE_STARTER_*`, `PADDLE_PRICE_PRO_*`, `PADDLE_PRICE_BUSINESS_*` | Paddle Price IDs | required for paid checkout |
| `RUN_DB_TESTS` | gate DB tests | leave unset in prod |
| `NEVORA_ENABLE_CRM` | paused-module flag | **must be unset/false in prod** |
| `NEVORA_ENABLE_BOOKING` | paused-module flag | **must be unset/false in prod** |
| `METRICS_SECRET` | internal metrics / job health | **secret**; distinct from `CRON_SECRET` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` / `TELEGRAM_WEBHOOK_SECRET` | Telegram capture | **secret**; re-register the webhook when the URL changes |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` | Slack capture | **secret** |
| `RESEND_INBOUND_WEBHOOK_SECRET` / `INBOUND_EMAIL_DOMAIN` | email forwarding | **secret** + receiving domain |
| `OPENAI_API_KEY` | voice transcription | **secret**; billed; unset ⇒ bot asks for text |
| `GOOGLE_GMAIL_*` / `GMAIL_TOKEN_ENCRYPTION_KEY` | Gmail invoice import | **secret** |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | error reporting | recommended |
| `TASKS_TRANSPORT` / `TASKS_API_URL` / `TASKS_SERVICE_AUTH_SECRET` / `TASKS_SHADOW_READ_PERCENT` | Tasks service seam | production runs `shadow` |

- [ ] Every secret set in **Production** scope (not only Preview).
- [ ] `DOCUMENT_EXTRACTION_MOCK` is **off**.
- [ ] `NEVORA_ENABLE_CRM` and `NEVORA_ENABLE_BOOKING` are **unset** (any value other
      than `true`/`1` keeps the modules paused; unset is preferred).
- [ ] No secret exposed via a `NEXT_PUBLIC_` name by mistake.
- [ ] Billing mode is explicit. Use `BILLING_MODE=private_beta` unless Paddle
      checkout, webhook, portal and plan unlock smoke tests are complete.
- [ ] If `BILLING_MODE=paid_beta` or `BILLING_MODE=production`, all Paddle
      secrets and paid Price IDs are set in Production scope and are absent from
      the repository.

**Billing note:** the repository default is Private Beta. Paid plan activation
must arrive through the verified `/api/billing/webhook` provider path; checkout
success redirects never mutate `billing_subscriptions`. Customer Portal is
disabled in Private Beta and available only to authenticated billing managers
when Paddle runtime config is complete.

**Security note:** a real legacy payment-provider test key was previously
removed from `.env.example`. Rotate the leaked test key in the provider
dashboard before making or keeping the repository public.

---

## 2. Active scope gate

Phase A locks the product promise. Confirm before shipping:

**Active modules** — Action Center (`/dashboard`), Inbox + channels (Telegram,
Slack, email), Tasks + Projects (`/tasks`), Finance (`/finance`), Documents,
Subscriptions (`/subscriptions`), Settings, Members, Billing / Plans / Limits,
Notifications, Relations, Automation, Domain Events, Developer Access, Trial
lifecycle. Overview, Analytics and AI pages exist but are not in the navigation.
Financial Tasks were removed in `115`.

**Paused modules** — CRM, Leads, Clients, Deals, Contacts, Pipelines, Booking
(including its public surface).

- [ ] `/dashboard` renders the **Action Center**, not a metrics roll-up.
- [ ] `/dashboard/overview` holds the secondary metrics roll-up.
- [ ] `/dashboard/actions` 307s to `/dashboard` (old bookmarks + persisted
      `notifications.target_url` still resolve).
- [ ] `/dashboard/crm` returns 404.
- [ ] `/dashboard/booking` and every child route return 404.
- [ ] `/booking/<org-slug>` (public) returns 404.
- [ ] `GET /api/public/booking/*` returns 404 (6 routes).
- [ ] `GET /api/internal/booking/availability-rules` returns 404.
- [ ] CRM / Booking Server Actions reject with `PausedModuleError` when POSTed
      directly. *(Hiding a nav link is not a gate; the action is the surface.)*
- [ ] No CRM/Booking entry in the sidebar.
- [ ] Landing + pricing copy list no paused module and no autonomous-AI claim.

Automated by `shared/config/paused-modules.coverage.test.ts` — it scans the tree,
so a *newly added* ungated CRM/Booking file fails CI.

### Booking data layer — closed (`098`)

Migration `016` had granted `anon` SELECT on the booking tables and EXECUTE on
the public booking RPCs, so the module was gated in the app but not in the
database. `098` revoked both (verified 2026-07-09 with the public anon key:
`42501` on every booking table, `401` on the RPCs). Re-check if anything touches
booking grants:

```sh
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/booking_pages?select=organization_slug" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"   # must be a permission error
```

---

## 3. Financial + notification invariants

- [ ] `docs/contracts/financial-workflows.md` invariants F1–F8 hold.
- [ ] `docs/contracts/notification-lifecycle.md` — read is not resolved.
- [ ] `npx vitest run test/release-invariants.test.ts` green.
- [ ] Behavioural confirmation done via `smoke-test-checklist.md` (structural
      tests cannot prove runtime behaviour).

---

## 4. Cron routes

All cron routes fail closed on a missing/invalid `CRON_SECRET`.

- [ ] `/api/cron/reminders`
- [ ] `/api/cron/extraction-sweep`
- [ ] `/api/cron/subscription-sweep`
- [ ] `/api/cron/suggestions-sweep`
- [ ] `/api/cron/trial-sweep`
- [ ] `/api/cron/action-items-sweep`
- [ ] `/api/cron/purge-deleted-accounts`
- [ ] `/api/cron/usage-reconcile`
- [ ] Each returns non-200 with no secret. Verify one by hand:
      `curl -i https://<host>/api/cron/reminders` ⇒ must not be 200.
- [ ] Every route has a `netlify/functions/<name>.mts` wrapper with a `schedule`
      matching [`job-reliability-register.md`](./job-reliability-register.md).

Background jobs use the service role. Each must be **scoped, idempotent, and
logged**. Outside background jobs, the service role appears only on the
session-less surfaces and exceptions listed in `docs/ARCHITECTURE.md`.

## 4b. Machine routes

- [ ] Every webhook answers non-200 to an unsigned request:
      `/api/channels/telegram/webhook`, `/api/channels/slack/interactivity`,
      `/api/channels/email/inbound`, `/api/billing/webhook`.
- [ ] A 307 to `/login` from any of them means the route is missing from
      `MACHINE_ROUTES` or production is serving an old build.

---

## 5. Local gates (must all pass)

```sh
npm run typecheck   # next typegen && tsc --noEmit
npm run lint
npm run test        # vitest run
npm run build
```

- [ ] typecheck
- [ ] lint
- [ ] test
- [ ] build

---

## 6. Go / No-Go

**No-Go if any of these is true:**

- A paused module is reachable by page, Server Action, or route handler.
- A posted money transaction can be created without explicit confirmation.
- Confirming the same draft can post twice, or a subscription cycle can be
  settled twice.
- Anything outside Finance and review confirmation inserts into `money_transactions`.
- Mark-all-as-read changes any obligation state.
- `organization_id` is trusted from the client anywhere.
- The service role is used outside the list in `docs/ARCHITECTURE.md`.
- A channel webhook does work before verifying its signature.
- A cron route answers 200 without `CRON_SECRET`.
- Migration baseline in this doc disagrees with `supabase/migrations/`.
- Landing or pricing copy promises a paused module or autonomous AI.

**Go requires:** all §5 gates green, §2 scope gate confirmed, §0 baseline
verified against the tree, and the smoke checklist executed against production
data by a human.

---

## 7. After deploy

- [ ] `/api/health` returns 200.
- [ ] Run `docs/release/smoke-test-checklist.md`.
- [ ] Watch cron executions for one full cycle.
- [ ] Rollback plan ready: `docs/release/rollback-plan.md`.
