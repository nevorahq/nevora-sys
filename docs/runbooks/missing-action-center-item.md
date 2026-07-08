# Runbook — Missing Action Center Item

**Severity:** P2 (P1 if a financial obligation is invisible).

Symptom: an obligation exists (overdue task, due subscription, unreviewed
document) but `/dashboard` does not show it.

## 0. Where items come from

`action_items` (migration 048) is an **orchestration cache**, not a source of
truth. Items are generated idempotently by `syncActionItems()`, which runs
best-effort when the Action Center page loads, plus by cron sweeps.

So a missing item usually means generation didn't run or was filtered — the
underlying obligation is almost always fine.

## 1. Triage, cheapest first

1. **Press Refresh** on the Action Center (calls `refreshActionCenter()`).
   If the item appears, generation was simply behind. Not a bug.
2. **Check the item exists at all:**
   ```sql
   SELECT id, type, status, priority, due_at, snoozed_until, assigned_to
   FROM public.action_items
   WHERE organization_id = '<org>' AND source_id = '<obligation-id>';
   ```
3. **Check it's not merely hidden:**

| Status / field | Why it's not in the feed |
|---|---|
| `status = 'snoozed'` + `snoozed_until` in the future | Working as designed |
| `status = 'resolved'` / `'dismissed'` | Moved to Recently Resolved (7-day window) |
| `status = 'cancelled'` | The source obligation went away |
| `assigned_to` = another member | Visibility rules — see `action-visibility-service.ts` |
| `workspace_id` ≠ active workspace | Wrong workspace selected |

## 2. If the item was never generated

Check, in order:

- **`syncActionItems` is failing silently.** It is wrapped in try/catch so it can
  never break the page. Look for `[ActionCenterPage] sync failed:` in logs.
- **`[syncActionItems] insert failed RLS`** — this is the **expired-trial write
  lock**, not a tenancy bug. A read-only org cannot write `action_items`. Restore
  entitlement (see `billing-subscription-mismatch.md`). Expected, and silenced.
- **The generator has no rule for this signal.** Every item type comes from an
  explicit rule in `action-item-generator.ts`. A brand-new obligation kind needs
  a rule; it will not appear by magic.
- **Cron sweep not running.** See `cron-failure.md`.

## 3. Do not "fix" it by inserting rows

Never hand-insert into `action_items`. Fix the generator rule, then let
`refreshActionCenter()` rebuild. Hand-inserted items lack the links and event
trail the resolution actions depend on, and will resurface or fail to resolve.

## 4. Notification read state is unrelated

If the complaint is "I marked everything read and the item vanished", that is a
**P0 invariant break** — read must never resolve. See
`docs/contracts/notification-lifecycle.md`. Conversely, "I marked everything read
and the item is *still there*" is correct behaviour, not a bug.

## 5. Verify

- [ ] The obligation appears after Refresh.
- [ ] It is org-scoped (invisible from another org).
- [ ] Resolving it moves it to Recently Resolved and emits a domain event.
- [ ] Snooze hides it until `snoozed_until`, then it returns.

## Related

- `docs/contracts/notification-lifecycle.md`
- `docs/runbooks/cron-failure.md`
- `modules/action-center/services/action-item-generator.ts`
