# Notification Favicon Marker Debug Report

Date: 2026-07-04

## Symptom

The browser tab favicon marker stayed active even when the user saw no active/new notifications in the header notification UI.

## Root Cause

`NotificationProvider` applied the favicon badge with `counters.urgent > 0 ? counters.urgent : counters.unread`.

The visible header notification badge is driven by `unreadCount` only. `urgent` is a separate obligation/action signal produced by `get_notification_counters` from due-today/overdue obligations and surfaced in Action Center/Dashboard. This made the favicon represent a different state than the notification bell/dropdown.

## Fix

The favicon now mirrors the visible notification bell: it is badged only when `counters.unread > 0`.

Urgent obligation counters remain preserved in `NotificationCounters` and continue to be available to Action Center/Dashboard, but they no longer create a browser-tab marker by themselves.

## Regression Test

Added a provider test that renders `initialCounters` with `unread: 0` and `urgent: 2` and asserts that `FaviconBadgeManager.apply` receives `0`, not `2`.

## Verification

- `npm test -- modules/notifications/components/notification-provider.test.tsx modules/notifications/services/favicon-badge-manager.test.ts modules/notifications/services/favicon-badge-manager.browser.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm test`

Status: DONE
