# ADR 002: Multichannel task capture

- Status: Accepted
- Date: 2026-09-28

## Context

Tasks can originate anywhere: a thought typed into the app, a photo of a
whiteboard, a contract PDF, a Slack thread, a Telegram message, an email. The
product already has a Capture Inbox (`modules/planner`, `/dashboard/inbox`) with
three modes — text, photo, document — but a code audit on 2026-09-25 found it is
not one pipeline:

1. **Text** → `detectPlannerIntent` → `planner_suggestions` → `routeAccept` →
   `tasks.createStandardTask` through the Tasks seam (`platform/tasks/server.ts`).
2. **Photo / document** → Documents upload + async extraction
   (`normalize-financial-document.ts`, Anthropic vision) → `financial_suggestions`
   (`modules/review`). A document without an amount (a contract, a handwritten
   list, a whiteboard photo) ends in a generic "review this document" action
   item. **A photo or document can never become a task today.**
3. `routeAccept` executes only `create_task`, `link_entities` and
   `create_action_item`. The financial suggestion types were retired with the
   Financial Tasks concept, but both the AI prompt and the no-AI fallback still
   proposed them, so every payment-flavoured text capture produced a draft that
   could not be accepted.
4. `detectPlannerIntent` is not metered, unlike `documents.process`.
5. Slack and Telegram have no code at all. The existing Gmail integration is
   read-only, on-demand and scoped to subscription invoice import. There is no
   inbound email, no job queue (the house pattern is cron sweep + status
   column), and a new machine-facing route is redirected to `/login` unless it
   is listed in `MACHINE_ROUTES` (`shared/config/routes.ts`).

## Decision

### One intake, many adapters

Every channel terminates in the same place: a `planner_entries` row, processed
into `planner_suggestions`, reviewed in the Inbox, accepted through
`routeAccept`. A channel adapter only:

1. verifies the inbound request (Slack signing secret, Telegram secret-token
   header, inbound-email provider signature);
2. maps the external identity to `{ organizationId, workspaceId, actorId }`;
   an unknown sender is refused (email) or asked to link first (Telegram);
3. hands text to the text path and attachments to the document path.

No channel gets its own suggestion table, classifier or task-creation call.

### Confirm-first, always

Nothing arriving from a channel creates a task without the user pressing
Accept. Auto-accept for high-confidence, rule-matched captures is a possible
later decision, not part of this ADR.

### Tasks are created only through the Tasks seam

Channel-originated tasks are created by `routeAccept` → `createStandardTask`
via `getTasksApplication`. Of the six code paths that insert into `todos`
today, this is the one that respects ADR 001; new code must not add a seventh.

### "Category" of a task = its project

`todos` has no category column, and the reuse rule is to not invent one when
an existing concept fits. A capture's category is the **project** it belongs
to (plus priority and due date). Classification is rule-first, AI second,
mirroring `classifyExpense`: a user's correction becomes a private rule so the
next similar capture is classified without a model call. The rules table is a
new migration; until it lands, classification is AI-only against the org's
project list.

### Money stays on its own route

A photo or document is classified *money or work* before anything else.
Money (receipt, invoice, payment confirmation with an amount) keeps the existing
`financial_suggestions` route and every invariant of `money-invariants`. Work
goes to `planner_suggestions`. A text capture about a payment becomes a plain
task ("Pay rent — 500 EUR"), never a money draft: Tasks and Money do not bridge.

### Channel choices

| Channel | Mechanism | Identity mapping |
|---|---|---|
| Telegram | Bot API webhook | `/start <link-code>` issued in Settings |
| Slack | Slack app, message shortcut "Send to Nevora" (not channel listening) | Slack OAuth install → team/user map |
| Email | Per-organization forwarding address via an inbound-email provider webhook | Known sender addresses of org members |

Gmail OAuth "watch" is deliberately not used for tasks: it needs Pub/Sub, reads
more of the mailbox than the user chose to send, and only covers Gmail.

Privacy rule for all channels: Nevora sees only what the user explicitly sent
it. The same message sent twice yields one capture (unique on channel +
external id).

## Rollout

**Step 0 — make the existing Inbox honest (prerequisite)**

- 0.1 The detector (AI prompt and no-AI fallback) proposes only `create_task`.
  Payment-flavoured text becomes a task carrying the amount in its description,
  and any other type the model returns is coerced to `create_task` instead of
  producing an un-acceptable draft. The prompt carries today's date so relative
  dates resolve to the right year. *Done 2026-09-28.*
- 0.2a Meter AI intent detection. *Done 2026-09-28.* Decision: captures share
  the existing AI limit — no new pricing line. Each AI detection first inserts
  an `ai_requests` row with `action_type = 'capture_intent'` (migration 119);
  the `start_limit_ai_requests` trigger enforces the monthly `ai_calls` quota
  on that insert, the same guard transaction categorization uses. A denied
  insert makes the capture fall back to the no-AI normalizer — a capture is
  never lost to a limit. `capture_intent` is also counted in the
  `ai_suggestions.monthly` figure shown on the billing page. Note the DB quota
  is shared with document extraction and categorization: a trial org that
  spends its 20 calls on captures has none left for documents that month.
- 0.2b Project classification (AI-only first). Needs `projectId` on
  `CreateStandardTaskInput` — a change to `tasks-contracts`, the `.strict()`
  `tasks-api` wire schema and `tasks-runtime`, hence a redeploy of the staged
  Tasks service — plus a project picker on the review card (en/ru/ro). The task
  is created in the project's workspace, not the caller's default one.
- 0.3 Work route for photo/document captures. *Done 2026-09-28.* When the
  extraction classifies a document captured in the Inbox as `unknown` (not a
  receipt, invoice or payment confirmation), `runDocumentExtraction` runs task
  detection in document mode on its text and attaches the drafts to the
  existing capture (`propose-tasks-from-document-capture.ts`). The text is the
  PDF text layer or, for images, a `visibleText` transcription now returned by
  the same vision call (no second vision call; `max_tokens` raised to 4096 so
  the transcription cannot truncate the tool output). Rules:
  - drafts found → the extraction is `completed`, no expense draft and no
    generic review item: a work document never also becomes money;
  - no action found (a menu, a photo of nothing) → the existing route: expense
    draft if it has an amount, otherwise a document review;
  - financial document types never enter the work route;
  - document mode may return zero drafts, and never guesses a task without the
    model;
  - a retried extraction finds the drafts already on the capture and adds none;
  - the task-detection pass is not metered separately: the capture already
    spent one AI call on extraction.
  Found on the way: the extraction schema rejected any line item the model
  sent without a quantity or price (a menu, a price list) and failed the whole
  extraction; missing line values now read as null.

**Step 1 — `channel_integrations` + shared intake function** (migration 119),
with the dedupe key and the `MACHINE_ROUTES` entries.

**Step 2 — Telegram.** **Step 3 — Slack.** **Step 4 — Email forwarding.**

Each step keeps `typecheck`, `lint`, `test` and `build` green and is smoked
live before the next starts.

## Consequences

- One review surface, one set of invariants, one place to add a channel.
- Channels bring unauthenticated traffic onto an AI call; step 0.2 must land
  before step 2.
- Legacy pending drafts of the retired financial types remain unsupported in
  the review UI and age out through `expire-stale-planner-suggestions`.
