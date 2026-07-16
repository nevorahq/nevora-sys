# Cross-currency transfer RPC failure

## Symptom

EUR to USD preview calculated the expected amount, but submitting the transfer returned `Не удалось выполнить перевод`.

After migration 108 fixed the first failure, the next beta retry reached the
transaction insert and failed with SQLSTATE `42703`: `column "user_id" of
relation "money_transactions" does not exist`.

## Root cause

`public.create_money_transfer` is a `RETURNS TABLE(id UUID, ...)` PL/pgSQL function. Its account lookups used an unqualified `WHERE id = ...`, so PostgreSQL treated `id` as ambiguous between the output variable and the `money_accounts.id` column and raised SQLSTATE `42702`.

The same RPC insert also depended on the legacy `money_transactions.user_id`
column. The beta schema uses the current organization-scoped attribution model
(`created_by` / `updated_by`) and no longer has that column. Existing production
write paths in migrations 078 and 079 already follow the current contract.

## Fix

- Qualify both account lookups with `source_account.id` and `destination_account.id`.
- Apply corrective migration `108_fix_money_transfer_rpc_ambiguous_id.sql` to databases where migration 107 was already installed.
- Remove `user_id` from the transfer insert and attribute the actor through
  `created_by` / `updated_by`.
- Apply corrective migration `109_fix_money_transfer_rpc_legacy_user_id.sql`
  after migration 108.
- Preserve structured Supabase error logging in `create-transfer.action.ts`.

## Evidence

- Captured beta error: SQLSTATE `42702`, `column reference "id" is ambiguous`.
- User confirmed on 2026-07-16 that migration 108 was applied manually to beta.
- Captured the subsequent beta error: SQLSTATE `42703`, missing
  `money_transactions.user_id`.
- User confirmed on 2026-07-16 that migration 109 was applied manually to beta.
- User repeated the authenticated EUR to USD transfer after migration 109 and
  confirmed that the problem was resolved.
- Local checks passed: `git diff --check`, lint, focused Vitest (3 files,
  10 tests), and the full suite (181 files passed, 1 skipped; 1167 tests passed,
  3 skipped).
- Typecheck is currently blocked by unrelated pre-existing missing
  `financialContext.types` translations in `shared/i18n/dictionaries/ru.ts` and
  `ro.ts`; the transfer correction modifies SQL only.
- An earlier production build passed before those unrelated dictionary changes.

## Regression coverage

`supabase/tests/107_organization_exchange_rates_cross_currency_verification.sql`
exercises the transfer RPC and now asserts that its definition has no legacy
`user_id` dependency. Direct-write fixtures also use `created_by` / `updated_by`.
The local Supabase Docker stack is not running, so the SQL suite could not be
executed locally.

## Status

`DONE`: migrations 108 and 109 are applied, the regression suite passes, and
the user confirmed the original authenticated beta transfer now completes.
The unrelated RU/RO dictionary typecheck issue remains outside this bug's scope.
