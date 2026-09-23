# Debug report: `getRenewalInbox` schema drift

Date: 2026-08-22

## Symptom

`/dashboard/subscriptions` logged `getRenewalInbox error: {}` from
`modules/subtracker/queries/get-renewal-inbox.ts`.

## Root cause

The application environment points to remote Supabase project
`uimpykbnatzhykzpastd`, while the Renewal Decision Inbox query already depends
on migration 117. Read-only PostgREST probes against that project reproduced:

- `PGRST205`: `public.subscription_renewal_cases` is absent from the schema cache;
- `42703`: `subscriptions.auto_renews` does not exist.

The raw error appeared as `{}` because `PostgrestError` fields are not reliably
enumerable when Next.js serializes a server-side console argument.

This is configuration/schema drift, not a race in `Promise.all`.

## Fix applied

- Applied pending migrations 113–117 to the local Supabase database after the
  migration 115 precondition returned zero non-standard financial tasks.
- Changed Renewal Inbox query logging to pass errors through
  `describePgError`, so `code`, `message`, `details`, and `hint` remain visible.

## Verification

- Local migration history is aligned through 117.
- `supabase/tests/117_subscription_renewal_decision_inbox_verification.sql`
  passes and rolls back its fixture data.
- `npm test`: 237 files passed, 1 skipped; 1984 tests passed, 3 skipped.
- `npm run typecheck`: passed for the root app and all standalone product apps.
- Fresh remote `limit=0` REST probes return HTTP 206 for both migration 117
  resources; the original schema errors no longer reproduce.

## Remote resolution

Migration 117 was applied to remote Supabase project
`uimpykbnatzhykzpastd` through its authenticated SQL Editor. The editor returned
`Success. No rows returned`. Fresh service-role PostgREST probes then returned
HTTP 206 for both `subscriptions(id, auto_renews, renewal_reminder_days)` and
`subscription_renewal_cases(id)`; the former `42703` and `PGRST205` errors no
longer reproduce.

## Status

DONE — local and remote schemas contain migration 117, the original PostgREST
failure no longer reproduces, and the full test/typecheck suites pass.
