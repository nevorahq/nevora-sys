# Domain Events — Contract & Automation Hardening

**Owner:** Platform
**Last updated:** 2026-07-02 (Phase 7.8)
**Source of truth for names:** `lib/events/domain-event-names.ts`
**Envelope schema:** `lib/events/domain-event.schema.ts`

The contract for domain events, the automation that consumes them, and the
idempotency guarantees behind the cron sweeps. Read before adding an event or a
background job.

---

## 0. Headline

The event layer is **already well-hardened**. Event **names cannot drift** — they
are a frozen `as const` list exposed as a `DomainEventName` union and enforced by
a zod `enum` at emit time, so an unregistered name fails validation and never
persists. The envelope requires organization + aggregate ids. Automation is
**idempotent by construction**: suggestions via a partial-unique index, extraction
via a claim-based state machine. All crons are fail-closed on `CRON_SECRET`.

No code changes were required in §7.8; this document is the contract + audit.

---

## 1. Emission rules

Emit **after** the business write succeeds, via `emitDomainEvent(...)`
(`lib/events/emit-domain-event.ts`). The helper:
- validates the envelope with `publishDomainEventSchema`,
- **re-checks `organizationId === requireOrg().org.id`** (cross-tenant guard —
  an event can't be attributed to another org),
- calls the `emit_domain_event` RPC, which **appends** to `domain_events` (an
  immutable log — never updated/deduped).

A failed emit logs and returns; it must **never** break the primary user action
(events are best-effort side effects).

## 2. Envelope contract (required)

| Field | Rule |
|---|---|
| `organizationId` | UUID, **required**, must equal the caller's active org |
| `eventName` | **must** be a member of `DOMAIN_EVENT_NAMES` (zod `enum`) |
| `aggregateType` | non-empty string ≤ 64 chars |
| `aggregateId` | UUID, **required** |
| `workspaceId` | UUID, optional |
| `payload` | object, size-bounded |

Enforced at runtime by the schema (tested in `domain-event.schema.test.ts`:
rejects unknown names and oversized payloads). Per-event payload **shapes** are
typed in TS via `DomainEventPayloadMap` at each call site.

## 3. Naming convention

`aggregate.action` (dotted, lower_snake segments). New events **must** follow it.

**Known historical exceptions — keep as-is, do NOT reuse the pattern** (renaming
would break matching against already-logged rows):
- `transaction.deleted` (vs the namespaced `money.transaction.created/updated`).
- `payment.received` / `payment.sent` (unnamespaced).
- `action_center.item_created` **and** `action_item.created` coexist (two names
  around Action Center items). Consumers must be aware both exist.

New money/action events should use the `money.*` / `action_item.*` prefixes.

---

## 4. Automation idempotency (verified)

| Automation | Guarantee | Mechanism |
|---|---|---|
| **Money AI suggestions** | ≤ 1 pending suggestion per transaction; a re-run can't duplicate | Partial-unique index `money_ai_suggestions_one_pending_idx` on `(transaction_id) WHERE status='pending'` (migration `069`) |
| **Document extraction** | A job is claimed once; crashes are recovered, not duplicated | Claim state machine `pending → processing → done/failed` + reaper (`STALE_PROCESSING_MS`) and lost-pending recovery (`LOST_PENDING_MS`) in `extraction-worker.ts`; the `after()` fast path and the sweep contend via a conditional `status` update |
| **Auto-categorization** | User rule applies directly; history/system/AI only create a pending suggestion (governed) | Money Intelligence rules (069/070); failures mark the row and never surface |

**Primary-write safety:** all of the above run in `after()` or cron and **cannot
break the originating action** — failures are logged (§7.5) and retryable.

---

## 5. Cron audit

| Cron | Schedule | Auth | Idempotency |
|---|---|---|---|
| `extraction-sweep` | `*/10 * * * *` | fail-closed `CRON_SECRET` | claim-based; re-running only recovers stuck jobs |
| `suggestions-sweep` | `0 3 * * *` | fail-closed `CRON_SECRET` | expires only still-`pending` rows → idempotent |
| `reminders` | `*/5 * * * *` | fail-closed `CRON_SECRET` | (verify reminder de-dup in §7.10) |

All log structured `cron.*` events (`info` on done, `error` on threw/misconfigured).

---

## 6. Gaps / follow-ups

- **Webhooks are registration-only.** Developer webhooks can be created/listed
  (`developer_webhooks`, reserved atomically), but **no delivery/dispatch code
  exists** in this build. Therefore the §7.5 "webhook delivery failed" event is
  **N/A until delivery is implemented** — do not assume webhooks fire. When
  delivery is built: sign payloads, log `webhook.delivery.failed`, and make
  retries idempotent (delivery id / dedup key).
- **Orphan-link sweep (from §7.4):** polymorphic `entity_links` can orphan when a
  referent is hard-deleted. Recommended: a low-frequency sweep (extend
  `suggestions-sweep` or a new daily cron) that soft-deletes links whose target no
  longer exists, using the query in `docs/audits/phase-7-data-integrity-audit.md`.
- **`reminders` de-dup:** confirm a reminder can't be sent twice for the same
  schedule/window (add a regression test in §7.10).

---

## 7. Definition of Done — §7.8 status

| DoD item | Status |
|---|---|
| Event names stable | ✅ frozen list + zod `enum` at emit (can't drift) |
| Payloads include required ids | ✅ envelope schema (org + aggregate ids) |
| Critical automation idempotent | ✅ suggestions (unique idx), extraction (claim SM) |
| Cron doesn't duplicate suggestions | ✅ partial-unique index guarantees it |
| Failed background actions logged | ✅ (§7.5) and never break primary write |
| Event contracts documented | ✅ this document |
| Suggestions not auto-applied without governance | ✅ pending-only; explicit accept required |

**§7.8 exit:** Event/automation layer is release-ready. Open follow-ups are the
orphan-link sweep, `reminders` de-dup test, and webhook delivery (a **future
feature**, not a Phase 7 blocker). Proceed to §7.9 (UX polish).
