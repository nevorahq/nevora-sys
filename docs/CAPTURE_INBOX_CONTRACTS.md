# Capture Inbox — Contracts

Technical contract for `modules/planner` (migration 080 onward). Last reviewed
2026-09-29. Channel intake (Telegram, Slack, email) is designed in
[`adr/002-multichannel-task-capture.md`](./adr/002-multichannel-task-capture.md);
this file covers the shared pipeline every channel ends in.

## Data model

### `planner_entries` — raw captured input

| column | notes |
|---|---|
| `id` | uuid PK |
| `organization_id` | FK organizations, **always from server context** |
| `workspace_id` | nullable FK workspaces |
| `raw_text` | the captured text (or a voice transcript) |
| `entry_type` | `text \| file \| photo \| link \| voice \| document` |
| `source` | `manual \| document \| subscription \| money \| task \| system \| channel` (`channel` since `121`) |
| `channel`, `channel_message_key` | set for channel captures; unique per org + channel, so a redelivered message is captured once (`121`) |
| `channel_signals` | where a channel capture came from (Slack conversation, email sender/domain) — input to project rules (`125`) |
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

**Suggestion type allow-list (DB):** `create_task`, `create_financial_task`,
`create_document`, `create_subscription_reminder`, `create_money_reminder`,
`link_entities`, `assign_project`, `create_project`, `create_action_item`.
There is intentionally **no** transaction / expense / income producer.

**What is proposed today:** the detector proposes only `create_task`
(ADR 002 step 0.1); any other type the model returns is coerced by
`coerce-detected-suggestion.ts`. The three financial types are **retired** —
Financial Tasks were removed in `115` — and remain in the allow-list only so
older drafts can still be accepted (as plain tasks, see below).

**Project:** a `create_task` draft carries a proposed project in
`proposed_payload` (`projectId`, with `suggestedProjectId` / `projectSource` /
`projectRuleId` as system keys an edit cannot set). A matching private rule from
`capture_project_rules` (`125`) decides the project before the model is asked;
changing the project on accept teaches or deletes that rule.

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
| `create_task` | `planner.suggestion.accept` + `data.write` | `tasks.createStandardTask` via `getTasksApplication` (Tasks seam) | no |
| `create_financial_task` / `create_money_reminder` / `create_subscription_reminder` (retired) | same | a plain task via `retiredFinancialDraftToTaskPayload` (payment date → due date, payee + amount → description) | no |
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

**Ownership (Inbox / Action-Center split):** the Action Center is **read-only** —
it owns *attention and routing*, never mutation. It no longer confirms, resolves,
dismisses, snoozes, assigns, executes, or deletes anything from its UI; those
controls (and the interactive feed + detail drawer) were removed. Each Attention
row instead offers a single navigation to its owning module, resolved by the pure
`getActionItemDestination(item)`:

- planner suggestion / entry → `/dashboard/inbox?tab=review&suggestion=<id>`
  (the exact Inbox Review);
- task → `/tasks/<id>`; transaction → `/finance/<id>`;
  subscription → `/subscriptions/<id>`; document → `/dashboard/documents/<id>`;
- unknown / deleted source → plain text, never a broken link.

The six summary cards are accessible **filter buttons** over the read-only
Attention list: selecting one writes `?filter=<key>` to the URL, and the card
count and the filtered list share one predicate contract
(`services/attention-filter.ts`), so a card's number always matches its list.
`action_items` remain the "what needs attention" projection; `domain_events` remain
the separate "what happened" history — never mixed. The Action Center no longer
renders that history as an Activity Log (removed 2026-09-28).

Capture-derived review lives in the **Inbox**, not the Action Center: planner
suggestions (text/photo/document) via `SuggestionReviewActions`, and a captured
document's extracted expense draft (`financial_suggestions`, `waiting_confirmation`)
via the reused `DocumentExtractionReview` + review Server Actions
(`getInboxDocumentReviews`). The Action Center is never a second confirm surface.
The Action Center backend actions/executors are retained but unused by its UI (see
report); the First Action Wizard lives on the Inbox page, not on `/dashboard`.

## Universal Capture — photo & document (migration 105)

Inbox now captures binary files, not just text. The composer
(`inbox-capture-composer.tsx`) has **Text / Photo / Document / Scan** modes; Text
is a Server Action, the others POST multipart to `/api/inbox/capture`. **Scan**
reads a receipt QR/barcode in the browser; the code is stored in
`documents.capture_code` (`120`) and re-parsed server-side, and its values win
over the model's header.

Flow (`captureInboxDocument`):

1. Client generates a stable `captureId` (UUID) and submits files + optional note.
2. The route checks planner + document permissions and billing/quota **before**
   any storage write (permission/quota denial ⇒ no partial records).
3. The **shared Documents upload service** (`createDocumentWithAttachments`) owns
   storage, validation, rollback, events, audit and extraction enqueue. The
   Documents dashboard route (`/api/documents/upload`) is now a thin adapter over
   the same service — Planner never copies the upload loop.
4. Exactly one sourced `planner_entry` is created/reused (`source = document`,
   `source_document_id`, `entry_type = photo|document`).
5. Readable files (PDF/PNG/JPG/JPEG/WEBP) run the existing extraction pipeline;
   unreadable ones (DOCX/HEIC/HEIF) are stored and fail fast into an **honest**
   manual-review state — never a faked "understood". A document **with an
   amount** becomes an expense draft (`financial_suggestions`); a document
   **without one** (a note, a whiteboard, a contract) becomes task drafts from
   its text (ADR 002 step 0.3). Never both.
6. The Inbox card shows a live capture state (processing / review ready / needs
   manual review / failed) derived from the linked Document's extraction.

**Idempotency (migration 105):** `documents.inbox_capture_id` is UNIQUE per
`(org, creator)` and `planner_entries` is UNIQUE per `(org, owner,
source_document_id)`. One retry therefore yields exactly one Document, one entry,
one suggestion and one Action Center item. A Document that stored but whose
planner link failed is **never deleted** — `reconcileInboxDocumentCaptures`
(run on Inbox render, best-effort) finishes the link on the next visit.

**Money safety:** the binary path has no route to `money_transactions` either.
Extraction may raise a reviewable financial draft, but only an explicit user
confirmation posts a transaction.

## AI safety rules

1. AI output **never** creates a business entity — only schema-validated
   suggestions. The user always confirms.
2. AI output is validated by `plannerIntentDetectionSchema`; invalid/absent →
   deterministic fallback (`normalizePlannerIntent`, money-safe types only) or a
   `failed` entry + review item.
3. The detection prompt forbids proposing any transaction/expense/income; the
   type allow-list makes it structurally impossible anyway.

## Money-transaction restriction (hard guarantee)

The planner has **no code path** to `money_transactions`: accepting any planner
suggestion creates a task, a link or an action item, never a transaction. A
posted expense can come only from the separate document path — an extracted
`financial_suggestions` draft that the user explicitly confirms
(`confirmFinancialSuggestionRecord`, see
[`contracts/financial-workflows.md`](./contracts/financial-workflows.md)).
Regression-guarded by `modules/planner/types/planner.types.test.ts`,
`normalize-planner-intent.test.ts` and `test/release-invariants.test.ts`.

## Permissions (RBAC, derived from role in `require-org.ts`)

`planner.entry.create|read|update|delete`, `planner.suggestion.read|accept|edit|reject`.
Members get the full capture+review set (accept still additionally requires the
target-entity permission); `planner.entry.delete` is manager+.

## RLS assumptions

Both tables: `SELECT` = `is_org_member(organization_id)`;
`INSERT`/`UPDATE` = `is_org_member AND can_write_data`, with `WITH CHECK`
(insert also requires `created_by = auth.uid()`). No hard delete (archive via
status). `organization_id`/`workspace_id` are always server-derived — RLS is the
defense-in-depth backstop against a spoofed payload. In-app capture uses no
service role; channel captures arrive without a session, so their context is
rebuilt from the linked account (`resolveChannelContext`) after the webhook's
signature check.

## Future improvements

- Today / Goals aggregation tabs (over existing tasks/action_items/projects).
- ~~File / photo capture via the documents module + obligation flow.~~ ✅ Done
  (Universal Capture beta, migration 105 — see section above).
- Background (cron/event) processing instead of synchronous on-capture detection.
- Move the onboarding funnel and Inbox capture reconcile off render-time and onto
  domain events (currently pull-based on the Inbox render, relocated off the
  Action Center render).
- Reuse document/project create paths for the currently-refused types.
- Auto-accept for rule-matched captures — explicitly **not** decided (ADR 002).
