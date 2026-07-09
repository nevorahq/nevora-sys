# Release Checklist — Nevora Business OS

**Status:** Canonical · **Last updated:** 2026-07-08 (Phase A)
**Supersedes:** [`phase-7-release-checklist.md`](./phase-7-release-checklist.md)
(kept for history; its migration section stops at 077 and is stale)

Run top-to-bottom before deploying. Do not skip §2 (migrations) or §3 (scope gate).

**Latest evidence (2026-07-09, commit `bb9c486`):**
[`release-evidence-2026-07-09.md`](./release-evidence-2026-07-09.md) (verdict:
**Private Beta Ready**, public launch No-Go) ·
[`smoke-test-report-2026-07-09.md`](./smoke-test-report-2026-07-09.md) (partial —
interactive flows NOT EXECUTED) ·
[`p0-p1-issue-register.md`](./p0-p1-issue-register.md) (P0/P1 closed; I-07 key
rotation + I-09 interactive smoke still open).

---

## 0. Migration baseline

| | |
|---|---|
| **Current baseline (tree)** | `000` – `099` (99 files, no duplicate prefixes; `054` is a known, intentional gap) |
| **Next free number** | **`100`** |
| **Remote state** | `000`–`099` verified applied on `uimpykbnatzhykzpastd` (`098`/`099` confirmed 2026-07-09 by probing anon denial + the `source_suggestion_id` column). |
| **`098` status** | Applied. Anon can no longer read booking tables or EXECUTE the public booking RPCs (verified with the public anon key). |
| **`099` status** | Applied. `todos.source_suggestion_id` + the four exactly-once indexes are live; the migration went in before the app deploy that writes the column. |
| **Phase A schema change** | **None.** Phase A is code + docs only. |
| **Phase B–D schema change** | `094` (planner confirmation), `095` (onboarding progress), `096` (Phase D commercial readiness), `097` (documents↔money↔subscriptions). |

> ⚠️ This table has gone stale twice: first at "000–086, next 087", then at
> "000–093, next 094" (which also wrongly claimed "93 files, no gaps" — there are
> 97 files and `054` is absent). **Do not reintroduce either.** Verify against the
> tree, not against a doc:
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
| `078` Subscription Payment Workflow | table `subscription_payment_cycles`; RPC `mark_subscription_payment_paid` | ✅ |
| `079` Financial Context Tasks | columns `todos.task_context_type`, `todos.financial_status` | ✅ |
| `080` Capture Inbox | tables `planner_entries`, `planner_suggestions` | ✅ |
| `086` Trial Reuse Protection | table `billing_trial_claims` | ✅ |
| `089` Trial Identity Hardening | table `billing_identities`; RPC `get_organization_access_state` | ✅ |
| `092` Billing Provider Boundary | table `billing_provider_events` | ✅ |
| `093` Analytics Writability | table `analytics_reports`; RPC `can_write_data` | ✅ |

Migrations are applied **manually** by the maintainer (the Supabase CLI is not
logged in). See `docs/runbooks/rollback.md` before applying anything irreversible.

---

## 1. Environment variables (verify in Vercel **Production** scope)

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
| `BILLING_MODE` | billing runtime mode | `private_beta` until Stripe smoke passes |
| `BILLING_PROVIDER` | provider selector | `stripe` only with `BILLING_MODE=stripe` |
| `STRIPE_SECRET_KEY` | Stripe API access | **secret**, server only; required for `stripe` mode |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature | **secret**, server only; required for `stripe` mode |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | public; never a live key in examples |
| `STRIPE_PRICE_STARTER_*`, `STRIPE_PRICE_PRO_*`, `STRIPE_PRICE_BUSINESS_*` | Stripe Price IDs | required for paid checkout in `stripe` mode |
| `RUN_DB_TESTS` | gate DB tests | leave unset in prod |
| `NEVORA_ENABLE_CRM` | paused-module flag | **must be unset/false in prod** |
| `NEVORA_ENABLE_BOOKING` | paused-module flag | **must be unset/false in prod** |

- [ ] Every secret set in **Production** scope (not only Preview).
- [ ] `DOCUMENT_EXTRACTION_MOCK` is **off**.
- [ ] `NEVORA_ENABLE_CRM` and `NEVORA_ENABLE_BOOKING` are **unset** (any value other
      than `true`/`1` keeps the modules paused; unset is preferred).
- [ ] No secret exposed via a `NEXT_PUBLIC_` name by mistake.
- [ ] Billing mode is explicit. Use `BILLING_MODE=private_beta` unless Stripe
      checkout, webhook, portal and plan unlock smoke tests are complete.
- [ ] If `BILLING_MODE=stripe`, all Stripe secrets and paid Price IDs are set in
      Production scope and are absent from the repository.

**Billing note:** the repository default is Private Beta. Paid plan activation
must arrive through the verified `/api/billing/webhook` provider path; checkout
success redirects never mutate `billing_subscriptions`. Customer Portal is
disabled in Private Beta and available only to authenticated billing managers
when Stripe runtime config is complete.

**Security note:** a real Stripe test key was previously removed from
`.env.example`. Rotate the leaked test key in Stripe Dashboard before making or
keeping the repository public.

---

## 2. Active scope gate

Phase A locks the product promise. Confirm before shipping:

**Active modules** — Dashboard (Action Center), Action Center, Tasks, Projects,
Financial Tasks, Money, Money Intelligence, Documents, Subscriptions,
Subscription Payment Workflow, Capture Inbox, Settings, Members,
Billing / Plans / Limits, Relations, Notifications, Automation, Domain Events,
Analytics, AI Assistant, Developer Access, Trial lifecycle.

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

### ⚠️ Known residual: the app gate does not cover the data layer

Migration `016` grants `anon` SELECT on `booking_pages` (and the host/service
tables the public flow needs). The **anon key is public by design**, so published
booking pages remain enumerable straight from the Supabase REST endpoint even
though every Next.js route 404s. Verified 2026-07-08 — 3 rows readable.

```sh
# Reproduces the residual read (no app involved):
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/booking_pages?select=organization_slug,public_enabled" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

- [ ] **Decide before public release** (product call, then tick):
  - [ ] Accept — booking page slugs are low-sensitivity, or
  - [ ] Set `public_enabled = false` on published rows (data change, reversible), or
  - [ ] Migration `094` narrowing the `anon` SELECT policies (revert when un-pausing).

This is not a Phase A regression — it predates it. But do not let §2 above read as
"Booking is fully gated" until this is settled.

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
- [ ] Each returns non-200 with no secret. Verify one by hand:
      `curl -i https://<host>/api/cron/reminders` ⇒ must not be 200.
- [ ] `vercel.json` schedules match the routes that exist.

Background jobs use the service role. Each must be **scoped, idempotent, and
logged**. The service role must never appear in an interactive request handler.

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
- "Mark as paid" can be made to post twice.
- Mark-all-as-read changes any obligation state.
- `organization_id` is trusted from the client anywhere.
- The service role is used in an interactive request handler.
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
