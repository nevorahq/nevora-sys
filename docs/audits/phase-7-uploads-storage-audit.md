# Phase 7.7 — Uploads, Documents & Storage Reliability Audit

**Status:** Draft 1 — review complete, P2-4 fixed
**Date:** 2026-07-02
**Codebase:** `main`, migrations through `077`
**Scope:** Phase 7 plan §7.7 — document/file flows, storage accounting, partial-
failure cleanup, subscription attachment path, file access security.

---

## 0. Headline

Upload flows are **secure and mostly reliable** already: private bucket + MIME
allowlist + path-scoped RLS (§7.2), byte-accurate storage limit enforced by a
trigger (§7.3), permission-gated route. The one real gap — the **main upload route
did not roll back on partial failure**, leaving an orphaned document + storage
objects — is **fixed here (P2-4)**. The two `*-document-with-attachments` services
already rolled back correctly.

---

## 1. Verified behaviors

- **File types:** bucket `documents` allows `pdf, docx, png, jpeg, webp, heic,
  heif` (migration `039`); `validateDocumentFile(s)` enforces extension + size
  before any write. Covers PDF, PNG/JPG, and **phone-camera photos** (heic/heif).
- **Storage accounting is byte-exact:** `assertPlanLimit(org, "storage.bytes", …)`
  pre-check + `enforce_storage_bytes_limit` BEFORE-INSERT trigger (bytes, live
  `SUM`). Now indexed by `document_attachments(organization_id)` (migration `077`)
  so the per-upload SUM no longer scans.
- **File access is org-scoped:** storage RLS keys read/write to the org UUID in the
  object path (`is_org_member`/`can_write_data`) — see §7.2. A leaked path is
  unusable without active membership.
- **Subscription attachment path creates NO money transaction:**
  `create-subscription-document-with-attachments.ts` uses `doc_type='other'`,
  never enqueues extraction, and emits `skip_money_sync: true`. Invariant holds;
  a regression test is recommended in §7.10.
- **Failed document insert releases the reservation:** all upload entry points
  release `documents.count` when the row is not committed (§7.3 P1-3 work).

---

## 2. Fix: orphaned document + storage on partial upload failure (P2-4)

**Before:** `app/api/documents/upload/route.ts` created the `documents` row, then
looped over files (validate → storage upload → attachment insert). A throw inside
the loop (bad file, storage error, metadata insert error) fell through to the
outer catch, which returned an error but **left behind**:
- the committed `documents` row (counting against the plan, as a broken empty draft),
- any files already uploaded to storage,
- any attachment rows already inserted.

(The `*-document-with-attachments` services already rolled back; the route did not.)

**After (this change):** the file loop is wrapped in a try/catch that, on any
failure, rolls back in order:
1. `storage.remove(uploadedPaths)` — delete objects already stored (best-effort),
2. delete `document_attachments` for the document,
3. delete the `documents` row — which fires `release_document_usage_on_removal`,
   returning the `documents.count` reservation (so it is **not** released
   explicitly, avoiding a double decrement).

The failure is reported via `reportError("documents.upload.partial_failed", …)`
(§7.5), returning a user-safe message + `diagnosticId`. The specific,
already-user-safe loop messages ("The file could not be uploaded.", etc.) are
preserved as the user message.

---

## 3. Residual notes

- **`after()` extraction failures** never affect the upload — the document exists
  and extraction is retryable; failures are logged (§7.5). ✅
- **Signed-URL TTL** (carried from §7.2 H-3) still to confirm short-lived on the
  download routes — ops/verification item, not code.
- **Storage cleanup for legacy orphans:** the reconciliation query in
  `docs/billing/usage-model.md` (counter drift) plus an orphan-object sweep can
  catch anything created before this fix. Optional; low volume expected.

---

## 4. Definition of Done — §7.7 status

| DoD item | Status |
|---|---|
| Uploads work reliably (PDF/PNG/photo, subscription path) | ✅ |
| Storage counters stay correct (bytes) | ✅ (§7.3 trigger + 077 index) |
| Subscription docs don't create money transactions | ✅ (invariant; test in §7.10) |
| Broken uploads cleaned / recoverable | ✅ **fixed** — route now rolls back (P2-4) |
| File access secure | ✅ (§7.2 storage RLS) |

**§7.7 exit:** Partial-failure cleanup now consistent across all three upload
paths. Signed-URL TTL is the one open verification (→ §7.11 ops checklist).
Proceed to §7.8 (automation, domain events & cron).
