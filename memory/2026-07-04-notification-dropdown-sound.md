# Notification Dropdown And Sound Debug Report

Date: 2026-07-04

## Symptom

The header notification dropdown showed grouped obligation summaries instead of each delivered notification. Overdue items appeared as aggregate rows such as overdue task counts. In-app sound could also fail after a tab reload even when the saved notification preference said sound was enabled.

## Root Cause

The dropdown was not reading `public.notifications`. It was composed from separate server aggregates: overdue task count, upcoming renewals, and pending booking requests. That made it diverge from the delivery history that drives unread counts, realtime inserts, and sound.

In-app sound is browser-gated. `notification-sound.ts` keeps an in-memory `unlocked` flag, which resets on reload. `NotificationProvider` only played sound if `isNotificationAudioUnlocked()` was already true, but it did not reactivate audio after reload unless the user visited notification settings again.

## Fix

The dashboard layout now loads unread notification rows and passes them into `NotificationProvider`. The provider owns the notification list, refreshes it with counters, prepends realtime INSERTs, and exposes `markAsRead`/`markAllAsRead` to the dropdown.

The dropdown now renders one row per `notifications` record, using category icons and each row's `target_url`. Opening a row marks that specific notification read.

When in-app sound is enabled, `NotificationProvider` now attempts to unlock audio on the first user gesture in the current tab. This aligns with browser autoplay rules without forcing the user back to settings after every reload.

## Regression Tests

- `shared/ui/notifications.test.tsx` verifies the dropdown renders individual notification rows, not a grouped overdue row.
- `modules/notifications/components/notification-provider.test.tsx` verifies provider notification state, single-row read removal, and first-gesture sound activation.

## Verification

- `npm test -- modules/notifications/components/notification-provider.test.tsx shared/ui/notifications.test.tsx modules/notifications/services/fetch-unread-notification-count.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`

Status: DONE
