# Notification and reminder policy

Nevora separates five states: domain state, Action Center attention state,
durable reminder schedule, notification delivery, and `read_at`. Reading a
notification acknowledges one delivery only. It never resolves, snoozes,
dismisses, pays, posts, completes, or cancels anything.

> The canonical semantics (Inbox / Notification / Action item / Resolved) and the
> domain-signal → surface mapping live in
> [`docs/contracts/attention-model.md`](docs/contracts/attention-model.md). This
> file covers the reminder scheduling + delivery half of that contract.

| Source | Milestones | Stop conditions |
| --- | --- | --- |
| Task | default: -3d, -1d, due day, +1d; high: -7d, -3d, -1d, due day, +1d, +3d | done, deleted, due date removed, recipient unassigned/inactive |
| Subscription | -7d, -3d, -1d, due day, +1d, +3d | renewed/next cycle saved, inactive, recipient inactive |
| Planned payment | -3d, -1d, due day, +1d | posted or deleted |
| Draft document | immediately, +24h, +72h | published, archived, or deleted |

Date-only task, subscription, and payment obligations execute at 09:00 in the
user notification timezone, falling back to the organization timezone and UTC.
Execution timestamps are stored as `timestamptz`; PostgreSQL IANA timezone data
handles DST. Quiet hours suppress disruptive push/audio delivery, not durable
in-app history.

`reminder_schedules.idempotency_key` includes source, recipient, milestone, and
the source date. A date change cancels pending/processing rows and inserts a new
set; delivered history is retained. Cron claims a bounded batch with
`FOR UPDATE SKIP LOCKED`, revalidates membership and source state, and atomically
creates the attention item, in-app notification, delivery record, and completion
state. Transient failures use bounded retries; stale rows are skipped with an
audit event.

Production backfill is explicit: call `backfill_reminder_schedules(org_id,
batch_size, true)` using the service role for a dry run, inspect counts, then
repeat with `false` in bounded batches. The migration itself performs no bulk
backfill and sends no historical milestone storm.

## Daily digest (ADR 003)

Outside the app, users get **one digest a day**, not one message per reminder
milestone: a summary of their organization's Action Center (overdue, due today,
everything that needs attention, up to five titles), computed with the same
predicates as the in-app filter cards. It goes to the linked Telegram chat at the
user's `digest_hour` (default 09:00) in their notification timezone — then the
organization's, then UTC — within a three-hour window, never during quiet hours,
and not at all on a day with nothing to show. `notification_digests` is unique
per organization, user, channel and local date; a row is claimed before sending
and a failed send is retried at most three times that morning. The digest is a
delivery only: it changes no action item, notification or domain row. Users turn
it off in Settings → Notifications. See
[`docs/adr/003-notification-channels.md`](docs/adr/003-notification-channels.md).
