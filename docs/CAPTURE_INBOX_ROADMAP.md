# Capture Inbox — Roadmap

_The thin input layer of Nevora Business OS. Introduced in Phase 8 (migration 080)._

## Business goal

Turn the product from "the user manually creates separate records in Tasks,
Documents, Money and Subscriptions" into "the user captures intent once, the
Business OS understands it, AI proposes a structured action, the user approves,
and the system creates linked, auditable, actionable business objects."

Capture Inbox is **not** a second Action Center and **not** a separate AI Planner
engine. It is a product surface that sits on top of the existing architecture.

```
raw user input
  → planner_entries          (raw capture)
  → AI intent detection      (detect-planner-intent, schema-validated)
  → planner_suggestions      (reviewable proposals)
  → accept / edit / reject
  → EXISTING module service  (task / financial task / entity link / action item)
  → entity_links + domain_events + action_items
  → Action Center / Inbox / Review
```

## Architecture

- **New module:** `modules/planner/` (actions, components, queries, schemas,
  services, types, utils). The route `app/(dashboard)/dashboard/inbox/page.tsx`
  is a thin composition layer only.
- **No new engines.** `accept` is a router that calls the EXISTING services:
  - `create_task` → `createStandardTask` (`modules/tasks/services`)
  - `create_financial_task` / `create_money_reminder` / `create_subscription_reminder`
    → `createFinancialTask` (money-safe; never posts a transaction)
  - `link_entities` → `createEntityLink` (`lib/entity-links`)
  - `create_action_item` → `createActionItemForDocument` (`modules/action-center`)
- **Action Center integration:** every suggestion materializes one idempotent
  review item in `action_items` (`source_type='ai'`, `source_id=suggestion.id`),
  resolved on accept/reject. The Inbox feeds the single center of attention.
- **Confidence bands** (spec §15): `>=0.85` ready, `0.60–0.85` needs review,
  `<0.60` insufficient → surfaced as a missing-information item.

## MVP scope (done)

- Route `/dashboard/inbox` + sidebar entry, bilingual (en/ru).
- Text-first capture → synchronous intent detection → suggestions.
- Accept / edit / reject lifecycle with Server Actions, Zod, RBAC and RLS.
- Tabs: **Inbox** (all captures) and **Review** (pending queue).
- Suggestion types wired end to end: `create_task`, `create_financial_task`,
  `create_money_reminder`, `create_subscription_reminder`, `link_entities`,
  `create_action_item`.

## Deliberately deferred

- **Today / Goals tabs** — aggregation views over existing tasks / action_items /
  projects. No new `today_items` table, no new reminder engine, no `goals` table
  (Goals will reuse `projects`).
- **File / photo / voice capture** — the enum reserves these; MVP is text-first.
  When added, files go through the existing documents module and the document
  obligation flow, never straight to a money transaction.
- **`create_document` / `assign_project` / `create_project`** — accept currently
  refuses these safely ("edit it into a task or reminder") until the underlying
  create paths are reused.
- **Background processing** — detection runs synchronously on capture for the
  MVP. A cron/event-handler path is the production follow-up (mirrors the Action
  Center generator note).

## Operational note

Migration `080_capture_inbox_foundation.sql` must be applied **after** 078 and
079 (created but not yet applied at the time of writing). Until 080 is applied,
`/dashboard/inbox` will error at the data-load step because `planner_entries`
does not exist yet.
