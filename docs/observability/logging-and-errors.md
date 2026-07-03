# Observability, Logging & Error Handling Policy

**Owner:** Platform
**Last updated:** 2026-07-02 (Phase 7.5)
**Related:** `docs/audits/phase-7-production-readiness-audit.md` (P2-1, P2-2)

How Nevora logs failures and how errors reach the user. Read before adding a new
server action, route handler, cron, or background job.

---

## 1. Structured logging

Use the dependency-free structured logger — **never** free-form `console.log`:

```ts
import { logger } from "@/lib/observability/logger";

logger.info("cron.reminders.done", { sent, skipped });
logger.warn("billing.reserve.denied", { organizationId, key, reason });
logger.error("documents.extraction.failed", { documentId, error: err.message });

const log = logger.child({ scope: "extraction", documentId }); // bound fields
```

- One JSON object per line → queryable in any drain (Vercel/Datadog/Logflare).
- Event names are **stable, dotted, `noun.verb`** identifiers (see §3) so alerts
  can key off `event`, not off message text.
- Levels: `debug` (dev only) · `info` (lifecycle) · `warn` (expected denial /
  recoverable) · `error` (unexpected / correctness signal).

---

## 2. User-facing error policy

Users must **never** see a raw error message, stack trace, or internal identifier.

### Server actions & route handlers — `reportError`

`lib/observability/report-error.ts` logs the failure with structure **and**
returns a user-safe `{ diagnosticId, message }`:

```ts
} catch (err) {
  const { message, diagnosticId } = reportError("documents.upload.failed", err, {
    userMessage: "We could not finish the upload. Please try again.",
    fields: { organizationId: org.id },
  });
  return NextResponse.json({ error: message, diagnosticId }, { status: 500 });
}
```

- `diagnosticId` is short and safe to show ("Reference: …"); it correlates the UI
  to the exact log line for support/admin diagnosis.
- Server-action results should carry a friendly `error` string (existing pattern)
  and, for unexpected failures, may include the `diagnosticId`.

### Client error boundaries

Error boundaries are Client Components and can't call `reportError` (server-only).
They render **friendly copy + Next's `error.digest`** as the reference id:

- `app/global-error.tsx` — root boundary (added Phase 7.5); self-contained
  `<html>/<body>`; shown only when the root layout itself throws.
- `app/(dashboard)/dashboard/error.tsx`, `…/actions/error.tsx`,
  `…/settings/error.tsx`, `…/documents/new/error.tsx` — route boundaries.

**Rule:** boundaries must not render `error.message`. (Phase 7.5 removed the two
that did — dashboard and actions — replacing it with static copy + `digest`.)

---

## 3. Critical events that MUST be logged

Minimum coverage for production diagnosis (Phase 7.5 DoD). ✅ = wired now.

| Event | Level | Where | Status |
|---|---|---|---|
| `billing.reserve.denied` | warn | `billing-service.reserveOrganizationUsage` | ✅ |
| `billing.reserve.failed` | error | `billing-service.reserveOrganizationUsage` | ✅ |
| `billing.release.failed` | error | `billing-service.releaseOrganizationUsage` | ✅ |
| `documents.upload.failed` | error | `api/documents/upload` (via `reportError`) | ✅ |
| `cron.*` (start/done/threw/misconfigured) | info/error | all 3 cron routes | ✅ (pre-existing) |
| document/OCR extraction failed | error | extraction worker/service | ✅ (pre-existing `logger`) |
| webhook delivery failed | error | webhook delivery path | ⚠️ verify (§7.8) |
| billing subscription state mismatch | warn | billing state resolution | ⬜ follow-up |
| RLS / security access denied | warn | surfaces as PostgREST error in actions | ⬜ opportunistic |
| unexpected server action exception | error | per-action `catch` (migrate to `reportError`) | ◻ partial |

`◻ partial`: ~265 `console.error` sites still exist. They keep working (the
logger wraps `console`), but should migrate to `logger`/`reportError` opportunistically
so every critical failure is a structured, greppable event. Not a release blocker.

---

## 4. Release-critical alerts (feeds §7.11 monitoring)

Alert when these events exceed a low threshold:

- `billing.release.failed` — **any** occurrence (counter drift / correctness).
- `billing.reserve.failed` — spike (RPC/DB problem, not normal denials).
- `cron.*.threw` / `cron.*.misconfigured` — automation stalled.
- `documents.upload.failed` / extraction failed — user-visible feature broken.
- 5xx rate on `/api/*`.

`billing.reserve.denied` is **expected** (users hit plan limits) — track as a
product metric, not an alert.

---

## 5. Definition of Done — §7.5 status

| DoD item | Status |
|---|---|
| Critical failures logged | ✅ core wired (§3); broad `console.error` migration is opportunistic |
| User errors safe & understandable | ✅ `reportError` + boundaries no longer leak `error.message` |
| Admin can diagnose billing/usage/document failures | ✅ structured events + `diagnosticId`/`digest` correlation |
| No raw stack traces in production UI | ✅ global-error + fixed boundaries |
| Cron/webhook failures visible | ✅ cron; ⚠️ webhook delivery to confirm in §7.8 |
