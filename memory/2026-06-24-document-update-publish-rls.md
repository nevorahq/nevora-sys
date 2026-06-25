# Document update / publish RLS investigation — 2026-06-24

- Symptom: saving a document update returned "Failed to update document".
- Root cause: changing a document to `published` triggers `snapshot_document_on_publish()`, which inserts an immutable document version. `document_versions` intentionally has no authenticated INSERT policy, but the trigger function was not `SECURITY DEFINER`, so the nested INSERT was denied by RLS.
- Fix: migration `044_fix_document_publish_snapshot_rls.sql` recreates the trigger function as `SECURITY DEFINER` with a pinned search path. Direct authenticated INSERT into `document_versions` remains denied.
- Verification: `npx tsc --noEmit`, `npm test` (59 tests), `npm run lint`, and `git diff --check` passed.
- Required live verification: apply migration 044 and save a draft document as published; verify a version row is created.
