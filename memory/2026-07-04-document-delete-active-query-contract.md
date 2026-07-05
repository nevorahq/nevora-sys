# Document delete active-query contract — 2026-07-04

- Symptom: on `/dashboard/documents/94bd07e5-57b2-4766-bee7-7b97ac130f32`, the "Delete document" action appeared not to work.
- Root cause: document delete is a soft-delete (`deleted_at`), but application read paths (`getDocumentById`, `getDocuments`, `getDocumentSummary`) did not explicitly filter `deleted_at IS NULL`; they relied on RLS to hide deleted rows. If the row remained visible through an application path/cache/RLS drift, the UI looked unchanged after delete. The delete dialog also swallowed returned server errors silently.
- Fix: active document queries now explicitly require `deleted_at IS NULL`; delete lookup does the same, revalidates list + detail paths, and carries `workspace_id` into `document.deleted`. The delete modal now displays server errors.
- Regression test: `modules/documents/queries/get-documents.test.ts` asserts list, summary, and detail queries all include the active-row filter.
- Verification: `npm test -- modules/documents/queries/get-documents.test.ts`, `npm run typecheck`, `npm run lint`, and full `npm test` passed.

## Repeat delete race follow-up — 2026-07-04

- Symptom: clicking/triggering "Delete document" again showed `Failed to delete document`.
- Root cause: two delete submits can both pass the active-document pre-lookup; the first RPC soft-deletes the row, while the second RPC raises `P0002/document_not_found` because the row is already soft-deleted. The desired state is already achieved, so this branch should be idempotent.
- Fix: `deleteDocumentAction` treats `P0002/document_not_found` from `soft_delete_document` as a successful no-op after the active pre-lookup. The client modal also uses a ref-backed submit guard so rapid double-clicks cannot start multiple delete actions before React re-renders the disabled button.
- Regression test: `modules/documents/actions/delete-document.action.test.ts` covers normal delete, repeat-delete `P0002` success, and real RPC failures remaining visible.
- Verification: `npm test -- modules/documents/actions/delete-document.action.test.ts modules/documents/queries/get-documents.test.ts`, `npm run typecheck`, `npm run lint`, and full `npm test` passed.

## Generic RPC failure follow-up — 2026-07-04

- Symptom: user still saw `Failed to delete document` for `тест фин подписка — Confirmare_de_plata_00990886570325.pdf`.
- Root cause hypothesis: the remaining generic branch is an RPC-level failure other than repeat-delete `P0002`: likely remote schema drift without `soft_delete_document` (`PGRST202`) or DB writability denial (`42501`) from `can_delete_data()` → `is_organization_writable()`.
- Fix: `deleteDocumentAction` now maps `42501`/read-only errors to an explicit billing/trial read-only message, and only for missing `soft_delete_document` falls back to a direct soft-delete `UPDATE` without `.select()`. The fallback still uses the user Supabase client, RLS, and the server-side `document.delete` permission check; it does not bypass forbidden/read-only states.
- Regression test: `delete-document.action.test.ts` covers missing-RPC fallback and forbidden/read-only messaging.
- Verification: targeted document tests, `npm run typecheck`, `npm run lint`, and full `npm test` passed.
