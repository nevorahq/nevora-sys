# Phase 7.4 — Data Integrity & Database Hardening Audit

**Status:** Draft 1 — review complete, migration `077` written
**Date:** 2026-07-02
**Codebase:** `main`, migrations through `077`
**Scope:** Phase 7 plan §7.4 — foreign keys, constraints, indexes, cascade/delete
behavior, orphans, duplicate relations, counter validity.

---

## 0. Headline

The schema is in **good structural shape**. Foreign keys are pervasive and mostly
explicit about delete behavior; enum/`CHECK` constraints are used widely; the
`entity_links` partial-unique index already prevents duplicate active relations;
usage counters are clamped non-negative. The only concrete defects were **three
tables missing an index on their hottest query path** — fixed additively in
migration `077`. One design characteristic (polymorphic link orphans) is
documented with a cleanup query rather than a schema change.

---

## 1. Foreign keys & delete behavior

Distribution across all migrations:

| `ON DELETE` | Count | Notes |
|---|---|---|
| `CASCADE` | 120 | Child rows removed with parent (org/workspace/document children) |
| `SET NULL` | 105 | `created_by`, `workspace_id`, optional refs — preserve rows, null the link |
| `RESTRICT` | 6 | Explicit protective refs |
| *implicit* (`NO ACTION`) | 7 | See below |

**Implicit-`ON DELETE` refs (7):** predominantly `created_by → auth.users(id)` and
`plan_id → plans(id)`. `NO ACTION` here is **desirable** — it prevents deleting a
plan that is in use, and user deletion is handled explicitly by migration `043`
(`allow_user_deletion_from_immutable_logs`). Two booking refs specify `ON DELETE`
on the following line (multi-line, not truly implicit). **No fix required**;
documented so a future reader doesn't "correct" a deliberate `RESTRICT`.

**Verdict:** delete behavior is predictable. Org deletion cascades cleanly; user
deletion is handled; plans are protected. ✅

---

## 2. Constraints

- **Enum/`CHECK`:** used widely (e.g. `document_attachments` extension /
  upload_status / scan_status / preview_status checks in `039`; `entity_links`
  `link_type` + `relation_direction`; task status; account balance
  non-negative `058`). Adequate for release.
- **Unique:** `entity_links_unique_active_idx` (partial, `WHERE deleted_at IS NULL`)
  prevents **duplicate active relations** — the §7.4 "no duplicate entity links"
  requirement is **already satisfied** (migration `047`). Soft-deleted links can
  coexist with a re-created active one, which is intended.
- **Counters:** `organization_usage_counters` release paths use
  `greatest(value - n, 0)` → **never negative** (migration `072`). ✅

---

## 3. Indexes — gaps found & fixed (migration 077)

The hot list/detail queries filter by `organization_id`. Three tables lacked
supporting indexes:

| Table | Gap | Hot path | Index added |
|---|---|---|---|
| `documents` | **No secondary index at all** | List: `WHERE organization_id ORDER BY updated_at DESC`; entity lookup: `+ entity_type/entity_id` | `documents_org_updated_idx`, `documents_org_entity_idx` (partial) |
| `domain_events` | **No indexes at all** | Analytics: `WHERE organization_id ORDER BY created_at`; automation: `(aggregate_type, aggregate_id)` | `domain_events_org_created_idx`, `domain_events_aggregate_idx` |
| `document_attachments` | No `organization_id` / `document_id` index | `enforce_storage_bytes_limit` trigger runs `SUM(size_bytes) WHERE organization_id` on **every** upload; detail page joins by `document_id` | `document_attachments_org_idx`, `document_attachments_document_idx` |

Already well-indexed (no change): `todos` (`todos_org_id_idx` + user composites),
`money_transactions` (org + account + category), `subscriptions` (org + user
composites), `entity_links` (org + workspace + partial-unique).

These feed directly into the §7.6 performance pass (they are the indexes that
keep the 500-row target datasets responsive).

---

## 4. Orphans & polymorphic links (design characteristic, documented)

`entity_links.source_id` / `target_id` are **polymorphic** (no foreign key — they
can point at tasks, documents, subscriptions, transactions, etc.). Consequence:
if a linked entity is **hard-deleted**, its links are not automatically removed →
orphaned links.

**Mitigation in practice:** the linkable core entities **soft-delete**
(`deleted_at`), so a "deleted" task/document/transaction still exists as a row and
its links stay valid (and are filtered by the reading queries). True orphans only
arise from a genuine hard delete.

**Not fixed via schema** (a polymorphic column can't carry an FK). Instead, detect
and clean periodically:

```sql
-- Orphaned entity_links whose target document no longer exists (repeat per type).
SELECT el.id, el.target_type, el.target_id
FROM public.entity_links el
WHERE el.deleted_at IS NULL
  AND el.target_type = 'document'
  AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id = el.target_id);
```

Recommended: a low-frequency sweep (or extend the existing suggestions/cron
sweep) that soft-deletes links whose referent is gone. Tracked for §7.8.

---

## 5. Transaction boundaries (spot check)

- Money **transfer** is a single-row insert (`type='transfer'`) — atomic by
  construction, no partial debit/credit possible (documented in the action).
- Multi-step document+attachment flows wrap storage+rows with rollback that
  deletes the document (firing the usage-release trigger) — see §7.3 work.
- Org creation is one `SECURITY DEFINER` RPC (org + owner + workspace + trial).

No cross-statement integrity holes found in the reviewed write paths.

---

## 6. Definition of Done — §7.4 status

| DoD item | Status |
|---|---|
| Critical entities protected by DB constraints | ✅ (FKs, checks, non-negative counters) |
| No orphan cross-module links | ⚠️ possible only via hard delete; cleanup query + §7.8 sweep (§4) |
| No duplicate entity links | ✅ already enforced by `entity_links_unique_active_idx` (047) |
| Hot queries have indexes | ✅ **fixed** — migration `077` (documents, domain_events, document_attachments) |
| Delete behavior predictable & documented | ✅ (§1) |
| Database remains migration-safe | ✅ additive `IF NOT EXISTS` indexes only |

**§7.4 exit:** Migration `077` is additive and safe; **not yet applied to remote**
(push with `076`). Orphan-link sweep deferred to §7.8. Proceed to §7.5
(observability) or apply `076`+`077` first.
