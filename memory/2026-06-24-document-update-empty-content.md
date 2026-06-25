# Document update empty-content investigation — 2026-06-24

- Symptom: saving a document from the status-filtered documents page returned `Invalid input: expected string, received null`.
- Root cause: the update action converted every empty form value to `null`; an empty `content` textarea must remain a string for `updateDocumentSchema`.
- Fix: extracted `normalizeDocumentUpdateFormData`, which retains normal text fields as strings and maps only empty optional entity fields to `null`.
- Regression test: `modules/documents/services/normalize-document-update-form-data.test.ts` covers empty content and entity fields.
- Verification: TypeScript, ESLint, `git diff --check`, and 61 Vitest tests passed.
