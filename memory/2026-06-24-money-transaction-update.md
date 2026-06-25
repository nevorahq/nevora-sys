# Money transaction update investigation — 2026-06-24

- Symptom: `/dashboard/money` displayed "Не удалось обновить транзакцию".
- Root cause: the update action used the legacy `user_id` predicate even though the money RLS and current creation flow are organization-scoped. The update could therefore match no row.
- Fix: resolve the active organization with `requireOrg()`, scope the update by `organization_id`, and record `updated_by`.
- Verification: `npx tsc --noEmit`, `npm test` (59 tests), `npm run lint`, and `git diff --check` passed.
- Remaining manual verification: update a transaction created by another member in the same organization and confirm it succeeds under the `can_write_data` policy.
