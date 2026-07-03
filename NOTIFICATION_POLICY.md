# Notification and reminder policy

Nevora separates five states: domain state, Action Center attention state,
durable reminder schedule, notification delivery, and `read_at`. Reading a
notification acknowledges one delivery only. It never resolves, snoozes,
dismisses, pays, posts, completes, or cancels anything.

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
