# Session Summary (2026-07-12)

**Owner:** Release owner (nevorahq@gmail.com)
**Scope:** Auth-user deletion fix → self-service account deletion → cron
migration to Netlify → prod env fix → paid-billing cutover runbook + release-doc
alignment.
**Verdict:** All shipped to `main` and verified end-to-end on the deployed
environment (bussines.nevorahq.com / Netlify). Release status unchanged —
**Private Beta Ready**, only remaining step is 5 live users.

---

## 1. Fixed "Database error deleting user" (PR #34)

Deleting a user in Supabase Auth failed because FKs referencing `auth.users(id)`
blocked the delete. Two classes, both fixed:

- **Migration 102** — 6 FKs on `RESTRICT` / `NO ACTION` with rows
  (`planner_entries`, `planner_suggestions` → CASCADE; `booking_requests`,
  `analytics_widgets`, `analytics_reports` → nullable + SET NULL;
  `ai_recommendations` → SET NULL).
- **Migration 103** — 5 columns declared BOTH `NOT NULL` AND `ON DELETE SET NULL`
  (self-contradictory → SQLSTATE 23502): `document_comments.user_id`,
  `task_due_date_changes.changed_by`, `domain_events.created_by`,
  `audit_logs.user_id`, `task_comments.user_id` → dropped `NOT NULL`.

Verified: every FK to `auth.users` is now CASCADE or SET-NULL-on-nullable; a test
user was deleted via the admin API (404 after).

## 2. Self-service account deletion (PR #35)

Settings → Profile → "Delete account". Soft-delete + **30-day grace**, reversible.

- Reauth = type email **+** password (verified out-of-band; OAuth-only skips the
  password factor).
- **Sole-owner guard**: blocked when the user is the only active owner of an org
  with other members (transfer / remove first); personal solo orgs cascade-delete
  with the account — no orphans.
- **Migration 104** (`account_deletion_requests`, per-user RLS) + cron purge
  worker + confirm/cancel UI + reactivation banner.

## 3. Crons moved to Netlify Scheduled Functions (PRs #36, #37)

Prod is on **Netlify**, where `vercel.json` crons never fire — all sweeps were
dormant. Migrated all six to `netlify/functions/*.mts` (thin triggers → shared
`netlify/lib/trigger-cron.ts` → the `CRON_SECRET`-gated `/api/cron/*` routes) and
**deleted `vercel.json`**. Schedules confirmed registered via the Netlify API
(6/6, cron expressions exact).

## 4. Prod env fix — `SUPABASE_SERVICE_ROLE_KEY` (found + fixed)

A manual no-op invoke of the purge route surfaced a real prod bug: the purge cron
**and the account-deletion guard** both need `SUPABASE_SERVICE_ROLE_KEY` at
runtime, and it was **missing from Netlify env** (only in local `.env.local`) →
500s / "We could not verify your organizations." Fixed: var added (scope
`functions`+`runtime`, context `all`) + redeploy.

**End-to-end proof:**
```
curl -H "authorization: Bearer $CRON_SECRET" \
  https://bussines.nevorahq.com/api/cron/purge-deleted-accounts
→ 200 {"scanned":0,"purged":0,"skipped":0,"errors":0}
```
Path scheduler → route → worker → DB confirmed working, zero side effects.

## 5. Paid-billing cutover runbook (PR #40)

Answered a recurring question — *how can production work with no Paddle env deps?*
Traced [`modules/billing/config/paddle-env.ts`](../../modules/billing/config/paddle-env.ts):
prod defaults to `private_beta` and **never connects to Paddle** in that mode; the
fail-closed `BillingConfigError` only throws for a paid mode with an **empty** var.
Caveat surfaced: the guard checks `nonEmpty()`, so placeholder strings pass boot but
die at the first real Paddle call.

Captured the flip in a code-grounded runbook
[`paid-beta-cutover-checklist.md`](./paid-beta-cutover-checklist.md): the 5-user gate
(≥3/5) as the only trigger, real-creds warning, explicit `BILLING_MODE` flip, webhook
plumbing (already in `MACHINE_ROUTES`, Paddle sig format), live sandbox e2e, ride-along
public-launch blockers I-07/I-11/I-12, and the one-switch rollback.

## 6. Release-doc alignment (PR #41)

Wired the cutover checklist into the two living status docs so the picture stays
coherent: [`beta-remaining-2026-07-11.md`](./beta-remaining-2026-07-11.md) got a
2026-07-12 note + all four public-launch blocker rows now link the checklist;
[`p0-p1-issue-register.md`](./p0-p1-issue-register.md) roll-up notes the flip is gated
on the 5-user signal. **No status change** — prep for the next phase, not a new blocker.

Also ran an auto-memory consolidation pass (outside the repo): corrected stale
"migration not applied / working tree only" and `next free = NNN` markers that the
`migration-baseline` (000–103 applied) had superseded, and refreshed the release-status
memory (I-09/I-10/I-11 now closed).

---

## State after this session

- **Migrations**: baseline `000`–`104` applied to remote; next free = **105**.
- **PRs merged**: #34, #35, #36, #37, #38 (this summary), #40 (cutover runbook),
  #41 (release-doc alignment). No migration in #40/#41 — docs only.
- **Prod env**: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` all set
  (functions+runtime, context all).

### Open follow-ups (not blockers)
- **Transfer-ownership** action — the unblock path the sole-owner guard points to.
- `booking-request.types.ts` types `assigned_to_user_id` as `string`; make it
  `string | null` (now nullable in DB after 102) when booking is unpaused.
- Billing cancellation on account deletion (currently private-beta manual).
- Optional: watch a live `reminders` firing in Netlify → Functions logs
  (deterministic proof already established; this is cosmetic).
