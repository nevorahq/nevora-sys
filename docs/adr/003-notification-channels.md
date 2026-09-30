# ADR 003: Notification channels — in-app first, one daily digest outside

- Status: Accepted
- Date: 2026-09-30

## Context

Nevora tells a user what needs attention through two channels today
(`modules/notifications/delivery/notification-delivery.ts`):

1. **In-app** — the bell and the Action Center. Always written; the durable
   record behind every reminder (see
   [`../contracts/attention-model.md`](../contracts/attention-model.md) and
   [`../../NOTIFICATION_POLICY.md`](../../NOTIFICATION_POLICY.md)).
2. **Web push** — VAPID, off by default, opt-in in Settings → Notifications.

Production on 2026-09-30 (three users, so direction, not statistics):
`push_subscriptions` is empty; all 27 push attempts in `notification_deliveries`
were `skipped / disabled`; 85 of 134 in-app notifications were read. In-app
reaches only users who already opened the app, and push reaches nobody.

What the market says:

- **Web push** — typical opt-in 5–15 % of visitors on the web. On iPhone it works
  only after the user installs the site to the home screen (PWA, iOS 16.4+);
  in a Safari tab it does not exist.
- **Email** — transactional mail is opened 45–65 % of the time, financial
  notices ≈ 69 %; slow, and open tracking is unreliable (Apple Mail Privacy).
- **Messengers** — bot messages are opened 80–90 %+, most within the hour.
  Telegram is among the top messengers in Moldova and the wider region our
  en / ru / ro audience comes from, and it is free to send.
- **Fatigue** — the main reason people turn notifications off is volume and
  irrelevance. Batching into digests is the standard remedy.

What the product already has: users link Telegram to capture tasks (ADR 002),
so `channel_integrations` holds a verified `external_chat_id`, and
`sendTelegramMessage` exists. Reminder milestones are dense (a task has 4–6, a
subscription 6), so forwarding each one to a messenger would be spam.

## Decision

### Layers, not a single "best" channel

| Layer | Channel | Role |
| --- | --- | --- |
| 1 | **In-app** (bell + Action Center) | Always written. The complete, durable list. Unchanged. |
| 2 | **Telegram** — one daily digest | The primary way to bring a user back. For users who linked Telegram. |
| 3 | **Email** — the same digest | Fallback for users without Telegram; later, escalation for critical unread items. |
| 4 | **Web push** | Optional, opt-in only, not promoted (desktop/Android; iOS only as an installed PWA). |

### The digest

- **One message per user per organization per local day**, at `digest_hour`
  (default **09:00**, the hour reminders already use) in the user's
  notification timezone, falling back to the organization's, then UTC.
- **Content = the Action Center buckets**, computed with the same
  `attentionPredicate` the app uses, so the numbers match what the user sees:
  overdue, due today, and everything that needs attention, plus up to five item
  titles (overdue first). A button opens the Action Center.
- **Nothing to report → nothing is sent.** An empty day is recorded as skipped.
- Requires an **active membership** with `action_center.view`.
- **Quiet hours** hold it back; the send window is three hours from
  `digest_hour`, so a missed or failed run is retried within the morning, never
  in the evening.
- **Idempotent**: `notification_digests` is UNIQUE per
  `(organization, user, channel, local_date)`; at most three attempts a day.
- **Opt-out** per channel in Settings → Notifications
  (`telegram_digest_enabled` and `email_digest_enabled`, both default on — the
  Telegram one only reaches users who linked the bot; the email one only users
  who did not). Category toggles keep governing per-event reminders; the digest
  is a summary of the Action Center, governed by its own switch.

### Unchanged rules

- **Confirm-first.** Digest buttons only open the app. Accepting a draft or
  marking something done from a messenger is a separate, later decision.
- **Read is not resolved.** A digest is a delivery; it never changes an action
  item, a notification's `read_at` or any domain row.
- **Mandatory billing/security** semantics stay as in the attention model: the
  durable in-app record is unconditional.

### Measure resolution, not opens

Telegram gives a bot no read receipts and email opens are distorted, so the
metric is **an action within 24 h of a digest** (resolved / paid / accepted),
compared between users with and without the digest. It feeds the launch gate's
"Action Center items resolved in 7 days ≥ 70 %".

## Rollout

**Step 1 — Telegram digest.** *Done 2026-09-30.* Migration `126`
(`notification_digests`; `telegram_digest_enabled`, `digest_hour` on
`user_notification_preferences`), `/api/cron/notification-digest` run hourly by
a Netlify Scheduled Function, the digest composer in
`modules/notifications/digest/`, and the switch + hour in Settings →
Notifications. Code tolerates the migration being absent (the cron answers
`migration_pending`, settings save without the new fields).

**Step 2 — Email digest.** *Done 2026-09-30.* The same digest by email (Resend)
for active members **without** an active Telegram link in that organization — a
user never gets both. Same schedule, claim and retry rules (the sweep is shared,
`modules/notifications/digest/send-digests.ts`, with one adapter per channel);
HTML + plain text in the user's language; a link to Settings → Notifications in
every message and as `List-Unsubscribe`. Switch `email_digest_enabled`
(migration `127`, default on). The address comes from Auth (service role).

**Step 3 — Escalation** for `high`/`critical` items still unresolved 24 h after
the in-app notification: one message on the user's outside channel.

**Step 4 — Measurement**: record digest → action within 24 h in the activation
funnel.

**Later, separate decisions** — actionable messenger buttons (accept a draft),
per-category digest filters, weekly summaries.

## Consequences

- Users who never open the app still see their overdue payments and due tasks
  every morning, in the messenger they read anyway.
- One message a day at most, and none on empty days, keeps the channel from
  being muted.
- A new background job joins the reliability register; Netlify must stay up for
  digests to go out, as for every other cron.
- Web push stays in the code but is no longer where effort goes.
