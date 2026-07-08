# Runbook — Document Upload Failure

**Severity:** P2 (P1 if uploads fail for all orgs).

Symptom: upload returns an error, hangs, or the document row exists with no file
(or the file exists with no row).

## 1. Triage

| Signal | Look at |
|---|---|
| 4xx immediately | Zod validation: file type, size, org scoping |
| 401 / 403 | `requireAppAccess` — expired trial makes the org read-only |
| 413 | Plan storage limit, or the platform body-size cap |
| 5xx | Storage RLS, bucket policy, or a missing env var |
| Succeeds, no file | Row committed before the upload — ordering bug |
| File, no row | Upload committed before the row — orphan |

Route: `app/api/documents/upload/route.ts`.
Attachments: `app/api/documents/[documentId]/attachments/route.ts`.

## 2. Common causes

- **Storage RLS.** Documents live in a *private* bucket (migration 039). The
  authenticated client must satisfy the bucket policy. A recent policy change is
  the usual culprit.
- **Plan limit.** Storage / document-count limits fire before the upload.
  The message must be honest ("storage limit reached"), not a 500.
- **Read-only org.** An expired trial blocks writes. This is intended.
- **Filename handling.** Filenames are PII. `redactFilenameForEvent()`
  (`lib/security/redact-filename.ts`) sanitizes before any `domain_events` /
  audit sink. A crash *inside* redaction fails the upload — check first.

## 3. Orphans

Both directions are possible and both are recoverable:

```sql
-- recent document rows; compare against the private bucket listing
SELECT id, storage_path, original_filename, created_at
FROM public.documents
WHERE organization_id = '<org>' AND deleted_at IS NULL
ORDER BY created_at DESC LIMIT 50;
```

`storage_path` / `original_filename` are the canonical columns since migration 039
(the older `file_path` / `file_name` remain for back-compat). Prefer
**soft-delete** of a row with no file; never hard-delete a document row that a
transaction or task links to — check `entity_links` first.

## 4. Verify

- [ ] Upload a small PDF and a PNG — both succeed.
- [ ] Upload an over-limit file → honest 413, no partial row.
- [ ] Upload as a member of org B, then try to read it from org A → not found.
- [ ] `domain_events` shows a redacted filename, never a raw one.
- [ ] Extraction picks the document up (see `extraction-job-stuck.md`).

## 5. Escalate

If uploads fail for every org: check `SUPABASE_SERVICE_ROLE_KEY` is **not** what
the upload route uses (it must use the authenticated client), then check the
bucket policy diff. See `docs/audits/phase-7-uploads-storage-audit.md`.
