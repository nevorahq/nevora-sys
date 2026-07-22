# Analytics & event privacy contract (Sprint 6 — S6.2)

**Status:** Normative. Product metrics and domain/audit events must measure
**outcomes, not secrets**. An event payload is broader-access telemetry than a
tenant's own rows, so it must never carry raw document content, raw identity, or
financial secrets. Enforced by `test/analytics-privacy.test.ts`.

Companion docs: [`domain-events.md`](./domain-events.md),
[`ai-governance.md`](./ai-governance.md).

---

## 1. What an event / metric payload MAY carry

- ids (organization, workspace, aggregate), enum values, status/type;
- counts, sizes (`size_bytes`), durations, timestamps;
- a **redacted** filename (`redactFilenameForEvent`);
- a **masked** email (`maskEmail`) when identity is unavoidable.

## 2. What it MUST NOT carry

- **document contents** — no OCR / extracted text, no `raw_text`, `ocr_text`,
  `extracted_text`, `raw_json`, `document_content` in a `payload` / `newData`;
- **raw identity** — no unmasked email address; no full name where an id suffices;
- **financial secrets** — no card / bank-account numbers, no credentials or tokens.

The distinction is the **event surface**, not the database: writing the real
filename to `document_attachments` (a tenant-scoped, RLS-protected row) is fine;
putting it in a `domain_events` / `audit_logs` payload is not — that goes through
`redactFilenameForEvent`.

## 3. Activation metrics are aggregate-only

`computeActivationFunnel` (`modules/onboarding/services/activation-metrics.ts`)
returns only counts, rates (`number | null`), and p50/p90 durations per first
action — no email, user id, name, or raw content. It is reachable only from
`/api/internal/activation-funnel`, which is `METRICS_SECRET`-gated and fail-closed.

## 4. Enforcement

`test/analytics-privacy.test.ts` scans every `payload: { … }` / `newData: { … }`
object literal in the event-emitting files and asserts: no document-content key;
any filename goes through `redactFilenameForEvent`; any email through
`maskEmail`. It also asserts the activation funnel output carries no identity
field and its endpoint is secret-gated.
