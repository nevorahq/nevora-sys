# Capture Inbox — Contracts

Technical contract for `modules/planner` (migration 080).

## Data model

### `planner_entries` — raw captured input

| column | notes |
|---|---|
| `id` | uuid PK |
| `organization_id` | FK organizations, **always from server context** |
| `workspace_id` | nullable FK workspaces |
| `raw_text` | the captured text (text-first MVP) |
| `entry_type` | `text \| file \| photo \| link \| voice \| document` |
| `source` | `manual \| document \| subscription \| money \| task \| system` |
| `status` | `captured → processing → suggested → accepted \| rejected \| archived \| failed` |
| `ai_detected_intent`, `ai_confidence` | filled after detection (confidence 0..1) |
| `source_*_id` | optional pointers to the seeding entity (FK-free by design) |
| `created_by` | FK auth.users |

CHECK: an entry must carry `raw_text` OR at least one `source_*_id`.

### `planner_suggestions` — reviewable AI proposals

| column | notes |
|---|---|
| `planner_entry_id` | FK planner_entries ON DELETE CASCADE |
| `suggestion_type` | see allow-list below |
| `title`, `description` | |
| `proposed_payload` | jsonb; **re-validated per type at accept, never mass-assigned** |
| `confidence` | 0..1 |
| `status` | `pending → accepted \| edited \| rejected \| expired \| failed` |
| `accepted_entity_type` / `accepted_entity_id` | set on accept |
| `reject_reason` | audit trail (record never deleted) |

**Suggestion type allow-list:** `create_task`, `create_financial_task`,
`create_document`, `create_subscription_reminder`, `create_money_reminder`,
`link_entities`, `assign_project`, `create_project`, `create_action_item`.
There is intentionally **no** transaction / expense / income producer.

## Suggestion lifecycle

```
capture -> processing -> detect intent -> suggested (N pending suggestions)
pending/edited --accept--> EXISTING service creates entity -> status accepted
pending/edited --edit-----> whitelisted fields updated -> status edited (still acceptable)
pending/edited --reject---> status rejected (+ reason), entry rejected if last one
detection empty ----------> entry failed + missing-information action item
```

Atomicity: a suggestion is marked `accepted` **only after** the target entity is
created. A failed creation leaves it pending (retryable). Side effects (entity
link back-reference, domain events, action-item resolution) are best-effort and
never roll back the user's decision.

## Accept routing → existing services

| suggestion_type | requires permission | routes to | money? |
|---|---|---|---|
| `create_task` | `planner.suggestion.accept` + `data.write` | `createStandardTask` | no |
| `create_financial_task` | `planner.suggestion.accept` + `data.write` | `createFinancialTask` (context `invoice_payment`) | **never posts a tx** |
| `create_money_reminder` | same | `createFinancialTask` (context `expense_review`) | **never posts a tx** |
| `create_subscription_reminder` | same | `createFinancialTask` (context `subscription_payment`) | **never posts a tx** |
| `link_entities` | `planner.suggestion.accept` + `entity_link.create` | `createEntityLink` | no |
| `create_action_item` | `planner.suggestion.accept` + `data.write` | `createActionItemForDocument` | no |
| `create_document` / `assign_project` / `create_project` | — | refused safely (MVP) | no |

## Action Center integration

- On suggestion creation → `action_items` row via `createActionItemForDocument`,
  keyed `(org, type, source_type='ai', source_id=suggestion.id)`:
  - `ai_suggestion` when confidence ≥ 0.85, else `missing_information`.
- On failed entry → `missing_information` item keyed by the entry id.
- On accept/reject → active items for those source ids are set to `resolved`.
- Idempotency comes free from the existing `action_items` unique dedup index.

## AI safety rules

1. AI output **never** creates a business entity — only schema-validated
   suggestions. The user always confirms.
2. AI output is validated by `plannerIntentDetectionSchema`; invalid/absent →
   deterministic fallback (`normalizePlannerIntent`, money-safe types only) or a
   `failed` entry + review item.
3. The detection prompt forbids proposing any transaction/expense/income; the
   type allow-list makes it structurally impossible anyway.

## Money-transaction restriction (hard guarantee)

Capture Inbox has **no code path** to `money_transactions`. Every financial
suggestion routes to `createFinancialTask`, which records a planned obligation
only. A posted expense can be created **only** later, via an explicit
Mark-as-paid on the resulting financial task (existing `mark_financial_task_paid`
RPC). Regression-guarded by `modules/planner/types/planner.types.test.ts` and
`normalize-planner-intent.test.ts`.

## Permissions (RBAC, derived from role in `require-org.ts`)

`planner.entry.create|read|update|delete`, `planner.suggestion.read|accept|edit|reject`.
Members get the full capture+review set (accept still additionally requires the
target-entity permission); `planner.entry.delete` is manager+.

## RLS assumptions

Both tables: `SELECT` = `is_org_member(organization_id)`;
`INSERT`/`UPDATE` = `is_org_member AND can_write_data`, with `WITH CHECK`
(insert also requires `created_by = auth.uid()`). No hard delete (archive via
status). `organization_id`/`workspace_id` are always server-derived — RLS is the
defense-in-depth backstop against a spoofed payload. No service role is used.

## Future improvements

- Today / Goals aggregation tabs (over existing tasks/action_items/projects).
- File / photo capture via the documents module + obligation flow.
- Background (cron/event) processing instead of synchronous on-capture detection.
- Reuse document/project create paths for the currently-refused types.
