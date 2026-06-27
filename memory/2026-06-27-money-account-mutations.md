# Money account update/deactivation investigation — 2026-06-27

## Symptom

Editing an account on `/dashboard/money` returned the generic update failure. Deactivating the account failed the same way. Runtime logs contained `updateAccount error` and `deactivateAccount error` at the corresponding attempts.

## Root cause

Both server actions still scoped `money_accounts` by the legacy `user_id` ownership model. Money accounts were migrated to organization ownership and org-based RLS in migration 004, so mutations must use the server-derived `organization_id`. The deactivate UI also discarded the action's returned error.

## Fix

- `updateAccountAction` now requires org context and `data.write`, scopes by account ID + organization + `deleted_at IS NULL`, records `updated_by`, and verifies a row was updated.
- `deactivateAccountAction` validates the account UUID, requires org context and `data.write`, applies the same org/non-deleted scope, records `updated_by`, and verifies a row was updated.
- `MoneyAccountsList` now presents deactivation failures as an inline alert.

## Evidence

- Regression test: `modules/moneyflow/actions/account-mutations.test.ts` (5 passing cases).
- Full suite: 175 passed, 3 skipped.
- TypeScript: passed.
- ESLint: 0 errors; one unrelated pre-existing warning.
- Next production build: passed.

## Status

DONE_WITH_CONCERNS: the mutation paths are verified with regression tests and the production build. A direct read-only schema check against the configured remote Supabase timed out from the execution environment, so the authenticated browser/database flow still needs one final manual click-through.
