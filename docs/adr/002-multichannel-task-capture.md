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

**Step 1 — `channel_integrations` + shared intake function.** *Done
2026-09-28, migration 121* (119 went to 0.2a).
- `channel_integrations` (external account ↔ user, one-to-one while active),
  `channel_link_codes` (one-time, SHA-256-hashed, 15-minute codes a user issues
  for themselves in Settings → Integrations), and `planner_entries.channel` +
  `channel_message_key` with a unique index per org + channel: a redelivered
  message is one capture. New source value `channel`. Explicit least-privilege
  grants: users read their own rows, may only flip their integration to
  `revoked` (column-level UPDATE) and issue codes for themselves; linking and
  code consumption are service-role only. Verified by
  `supabase/tests/121_channel_intake_verification.sql`.
- `modules/channels`: `resolveChannelContext` rebuilds the linked user's
  context without a session — active membership, the role's RBAC set
  (`permissionsForRole`, the same map `requireOrg` uses), capture permission,
  and `is_organization_writable`. `captureChannelText` is the durable write;
  `processChannelCapture` is the existing `processPlannerEntry` (same metered
  AI detection, same Review tab, same confirm-first accept into Tasks).

**Step 2 — Telegram.** *Text done 2026-09-28.* Bot API webhook at
`/api/channels/telegram/webhook` (in `MACHINE_ROUTES`), authenticated by the
secret token Telegram echoes, fail-closed (503 unconfigured, 401 wrong secret).
Private chats only. `/start <code>` links, `/stop` unlinks, `/help`; any other
text is captured. The capture is stored before answering 200, so a failure
answers 500 and Telegram redelivers; the AI step and the reply ("Added to your
Inbox: <task>" + a deep link to the Review card) run after the response. Bot
copy is in the dictionaries (en/ru/ro), in the user's app language. Setup:
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME`, then
`node scripts/telegram-set-webhook.mjs <origin>`.

*Photos and documents done 2026-09-28, migration 122.* A photo (largest size)
or a document sent to the bot is downloaded (capped at the Documents 10 MB
limit, checked against Telegram's reported size before downloading) and stored
through the same Documents upload service as an Inbox capture, with a
`serviceIdentity` option: the plan gates run against the service-role client
(`canUseFeatureForOrganization`, `assertPlanLimit` now take an optional
client), and the documents.count slot goes through
`reserve_/release_documents_usage_for_service` — service-role only, re-checking
active membership, writability and the plan limit inside PostgreSQL, like 114
for Tasks. The caption becomes the capture note; the capture id is derived from
org + channel + message, so a redelivery reuses the stored Document. The
extraction runs after the acknowledgement and the bot reports what came out:
an expense draft ("Receipt read: <merchant> — <amount>"), task drafts, a
document kept for review, or an unreadable file. Voice, video and audio are
declined.

The same change moved `runDocumentExtraction`'s plan gates from the session to
the caller's client. The extraction sweep calls it without a session, so a job
it recovered would have failed its plan gate as `usage_limit_exceeded` (not
seen in production data on 2026-09-28: the sweep had not recovered a job yet).

*Voice messages done 2026-09-29, migration 124.* Claude does not accept audio,
so a voice note (or a forwarded audio file) is transcribed by OpenAI's
speech-to-text (`gpt-4o-mini-transcribe`, chosen by the product owner; plain
HTTPS, no SDK) and the transcript becomes an ordinary text capture with
`entry_type = 'voice'`. Rules:
- metered first: an `ai_requests` row with `action_type = 'voice_transcription'`
  (migration 124) goes through the shared monthly AI quota before the model is
  called; there is no model-free fallback for audio, so a denied quota is told
  to the user;
- capped at 5 minutes / 25 MB, refused before downloading when Telegram's
  metadata already says too long;
- a redelivered message is looked up by its key before any paid work, and a
  failed or empty transcription is answered rather than retried — a retry would
  pay for the call again;
- the reply quotes what was heard (first 300 characters) above the draft, so a
  mis-transcription is visible at a glance;
- off unless `OPENAI_API_KEY` is set: voice is then declined with "send it as
  text".
- provider failures are split (2026-09-29, after a real `429
  credit_balance_exhausted`): an account problem (no credits, bad or revoked
  key) answers "voice is temporarily unavailable"; a transient one (rate
  limit, 5xx, timeout) answers "try again in a minute". In both cases the
  provider did no billed work, so the reserved quota unit is returned — the
  row is deleted, because the `ai_calls` quota counts every row of the month
  regardless of status (059). Heard silence (`empty`) was billed and keeps its
  unit. The log carries the provider's error type and code, never its message.

Deliberately not yet:
- **Domain events** for channel captures are not recorded: `emitDomainEvent`
  resolves the organization from the session (`requireOrg`) and logs instead.
  The capture, suggestions and AI metering are unaffected.

**Step 3 — Slack.** *Text done 2026-09-29; no migration (121 already allows
`slack`, 123's `metadata` holds the workspace name).*
- One Slack app, message shortcut **"Send to Nevora"** (`callback_id
  send_to_nevora`), `commands` scope only: no event subscriptions, no channel
  history. Nevora reads exactly the one message a user sends it. App manifest:
  `docs/integrations/slack-app-manifest.yml`; setup: `SLACK_CLIENT_ID`,
  `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`.
- Linking is the OAuth v2 install, per user, from Settings → Integrations →
  Slack (`/api/channels/slack/connect` → `/callback`, both session routes). The
  `state` is bound to an httpOnly cookie scoped to the callback path and to the
  user + organization that started it. The installing `authed_user` becomes the
  integration's `external_user_id` = `<enterprise or team id>:<user id>` (Grid
  org first: user ids are org-wide there). The bot token Slack returns is
  **not stored** — replies go through the interaction's `response_url`, which
  needs none. Linking reuses `linkExternalAccount` (extracted from
  `consumeLinkCode`): the same one-to-one rule as Telegram.
- Interactivity endpoint `/api/channels/slack/interactivity` (in
  `MACHINE_ROUTES`): Slack's `v0` HMAC over the raw body with a five-minute
  replay window (both directions), fail-closed (503 unconfigured, 401 bad
  signature). Any other interaction type is acknowledged unread.
- Slack allows three seconds and does not redeliver interactions: the capture
  is stored before the empty 200, every reply (ephemeral, visible only to the
  sender) and the AI step run after it. A storage failure is answered "try
  again" instead of thrown.
- Message key `<slack user>:<channel>:<ts>`: one user sending the same message
  twice gets one capture ("already in your Inbox"), two teammates sending it
  each get their own.
- Text: the message text, or for a message another app posted, its legacy
  attachments (pretext, title, text). Slack markup becomes plain text (`<url|label>`
  → `label (url)`, `<#C|name>` → `#name`, `<!here>` → `@here`, entities
  unescaped). User mentions without a label stay as ids — resolving names would
  need `users:read`.
- Replies are in the user's app language; an unlinked Slack user is answered in
  English (a shortcut payload carries no locale) with the Settings link.

Deliberately not yet:
- **Files** attached to a Slack message are not captured (a message with only
  files is answered "upload them in the Inbox"; with text, the text is captured
  and the reply says the files were skipped). Downloading `url_private` needs
  `files:read` and a stored, encrypted bot token — and the bot can only read
  files in conversations it was added to, which a shortcut does not guarantee.
- A `/nevora <text>` slash command and a global shortcut (capture a thought
  without a message) — cheap to add on the same endpoint if asked for.
- Uninstall events: without event subscriptions a revoked app simply stops
  sending shortcuts; the integration row stays until the user disconnects.

**Step 4 — Email forwarding.** *Done 2026-09-28, Resend Inbound, migration 123.*
Decisions (with the product owner): Resend as the provider; a **per-user**
address instead of one per organization; no reply on success, a notice only
on refusal.
- Address `inbox-<token>@<INBOUND_EMAIL_DOMAIN>`, issued / rotated / disconnected
  in Settings → Integrations. The random token is the integration's
  `external_user_id`, so the recipient identifies the user — automatic
  forwarding rewrites the sender, the recipient survives it.
- Webhook `/api/channels/email/inbound` (in `MACHINE_ROUTES`) verifies the
  Svix / Standard Webhooks signature over the raw body (Resend SDK), fails
  closed. The event is metadata only; the body, headers, SPF/DKIM/DMARC results
  and attachment URLs come from the receiving API.
- The sender must be the owner: a manual forward From their account email
  (DMARC must not fail, so it cannot simply be spoofed), or Gmail automatic
  forwarding naming them in `X-Forwarded-For`. Anything else is dropped
  silently — a leaked address alone cannot fill someone's Inbox, and unknown
  senders are never answered (backscatter). Other providers' automatic
  forwarding (which do not add such a header) is therefore not accepted yet;
  a verified list of extra sender addresses is the natural next step.
- Gmail's forwarding-confirmation mail is not captured: its code/link is stored
  on the integration (`metadata`, migration 123, webhook-written only) and shown
  in Settings so the user can finish the Gmail setup.
- Text: subject + the meaningful body (HTML → text, quoted replies and
  signatures dropped, a forwarded message's own body kept) → task detection.
  Attachments (up to 5, not inline images, 10 MB each) → the Documents pipeline
  as in step 2 (receipts/invoices → expense drafts, briefs → task drafts). A
  one-line body around attachments ("see attached") is not captured as text.
- Keys: `Message-ID` for the text, `Message-ID#attachment-id` per file — a
  redelivery is one capture. Auto-submitted mail and bounces are ignored.
- Refusals (read-only org, plan limit, oversized attachment) are mailed to the
  owner's account address — never to the sender, who may be a vendor.

Each step keeps `typecheck`, `lint`, `test` and `build` green and is smoked
live before the next starts.

## Consequences

- One review surface, one set of invariants, one place to add a channel.
- Channels bring unauthenticated traffic onto an AI call; step 0.2 must land
  before step 2.
- Drafts of the retired financial types (created before 0.1, or proposed by a
  model that ignores the prompt) are accepted as a plain task: the payment date
  becomes the due date, payee and amount go into the description. They are no
  longer a dead end. *Added 2026-09-28, after a real draft failed to accept.*
