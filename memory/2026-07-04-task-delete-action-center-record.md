# Task delete Action Center record

Date: 2026-07-04

## Symptom

Deleting a task from the Tasks dashboard produced no visible record on `/dashboard/actions`.

## Root cause

The task delete flow wrote `task.deleted` to domain events and a `delete` audit log, but `/dashboard/actions` renders `action_items`. If the task was deleted directly from Tasks and did not already have an Action Center item, there was nothing for the Action Center feed to show.

## Fix

Added `recordTaskDeletionInActionCenter` and called it from `deleteTaskAction`.

Behavior:

- If active task action items already exist, resolve them and publish an `action_item.executed` event.
- If no action item exists, create a resolved history item with `source_type = task`, `source_id = task.id`, and `metadata.source = task_delete`.
- Revalidate `/dashboard/actions` after task deletion.

## Evidence

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 120 files passed, 1 skipped; 571 tests passed, 3 skipped.

## Status

Fixed.
