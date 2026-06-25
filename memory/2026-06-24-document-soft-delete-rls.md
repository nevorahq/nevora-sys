# Document soft-delete RLS investigation — 2026-06-24

- Symptom: deleting a document left `documents.deleted_at` unchanged.
- Evidence: server returned `42501: new row violates row-level security policy for table documents`; the document row remained active.
- Root cause: document deletion is a soft-delete UPDATE, but the update policy only used `can_write_data` in `WITH CHECK`. Delete authority (`can_delete_data`) was only represented on the unused physical DELETE policy.
- Initial policy adjustment in migration 045 did not resolve the PostgREST re-check.
- Final fix: migration `046_secure_soft_delete_document.sql` restores the ordinary update policy and introduces `soft_delete_document(UUID, UUID)`. The SECURITY DEFINER function verifies `can_delete_data`, scopes by document and organization, then applies the soft-delete without exposing deleted rows through SELECT policies.
- Verification: `npx tsc --noEmit`, `npm test` (59 tests), `npm run lint`, and `git diff --check` passed.
- Required live verification: apply migration 046 and delete a document as manager/admin/owner; confirm `deleted_at` is set.
