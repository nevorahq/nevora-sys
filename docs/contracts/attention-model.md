# Attention model contract (Sprint 3 — S3.1)

**Status:** Canonical semantics for how a domain signal becomes something a user
sees and acts on. This is the contract the Sprint 3 work (event→action mapping,
failure visibility, counters) is built against. It is **navigation-independent** —
where these surfaces live in the primary nav is an open product decision recorded
in §6.

Companion docs: [`../../NOTIFICATION_POLICY.md`](../../NOTIFICATION_POLICY.md)
(reminder scheduling + delivery), [`financial-workflows.md`](./financial-workflows.md),
[`domain-events.md`](./domain-events.md).

Enums referenced below are the source of truth and are asserted against this doc
by `test/attention-model-contract.test.ts`:

- `ACTION_SOURCE_TYPES`, `ACTION_ITEM_TYPES`, `ACTION_ITEM_STATUSES` —
  `modules/action-center/types/action-item.types.ts`
- `NOTIFICATION_CATEGORIES` — `modules/notifications/types.ts`
- `PLANNER_ENTRY_TYPES` — `modules/planner/types/planner.types.ts`

---

## 1. The four canonical states

Each has ONE meaning. They are **independent** — advancing one never advances
another.

| State | Means | Lives in | Advanced by |
|---|---|---|---|
| **Inbox** | Captured but **not yet classified or accepted** | `planner_entries` (Capture Inbox) | user accepts / edits / rejects a suggestion |
| **Notification** | The user has been **informed** of something | `notifications` | delivery + `read_at` (acknowledges one delivery) |
| **Action item** | A **business action is required** | `action_items` (Action Center) | `open → in_progress → resolved` via the domain process |
| **Resolved** | The business action **actually happened** | domain row (task done, cycle paid, review confirmed) | the owning module's write, never a UI-state change |

Independent flags on an action item (each orthogonal, none implies another):
`read` (delivery), `snoozed` (`snoozed_until`), `dismissed` (`dismissed_at`),
`resolved` (`resolved_at`). Enforced by the state machine in
`modules/action-center/services/status-transitions.ts` (e.g. `resolved → open`
is forbidden without an explicit restore).

**Hard rule (already proven by `test/release-invariants.test.ts`):**
`mark_all_visible_notifications_read` writes ONLY to `notifications`. Reading a
notification never resolves, snoozes, dismisses, pays, posts, completes, or
cancels an obligation.

---

## 2. Surface responsibilities

- **Capture Inbox** — classify/accept raw input. Never a posted fact. Low-confidence
  captures stay here for review.
- **Notifications** (bell + delivery history) — inform only. Delivery state
  (`read_at`, quiet hours, sound) is separate from obligation state.
- **Action Center** — the single queue of *required business actions*. Attention
  and routing only; the actual mutation happens in the owning module.
- **Owning module** (Tasks / Money / Documents / Subscriptions) — the ONLY place a
  business action is resolved.

---

## 3. Domain signal → surface mapping

Every `ACTION_SOURCE_TYPE` maps here. "Notification category" uses
`NOTIFICATION_CATEGORIES`; reminder cadence per source is in `NOTIFICATION_POLICY.md`.

| Source (`ActionSourceType`) | Enters Inbox? | Notification category | Action item type(s) | Resolved when |
|---|---|---|---|---|
| **task** | via capture only | `task` | `due_soon`, `overdue`, `assignment_required`, `follow_up_required` | task status → done / deleted / unassigned |
| **document** | yes (upload/capture) | `document` | `document_review`, `draft_review`, `missing_information` | review confirmed / archived / deleted |
| **transaction** | via capture only | `payment` | `payment_required`, `approval_required`, `missing_relation` | draft confirmed or rejected (explicit) |
| **subscription** | no | `subscription` | `renewal_required`, `payment_required` | cycle paid / cancelled; **new cycle = new item** |
| **crm** | n/a (PAUSED) | — | — | module gated — emits nothing while paused |
| **automation** | no | `action_center` | `risk_detected`, `follow_up_required` | failure retried / fixed / dismissed |
| **ai** | no (suggestion overlay) | `action_center` | `ai_suggestion` | suggestion accepted / rejected (never auto-applied) |
| **system** | no | `action_center` | `approval_required`, `risk_detected` | the flagged condition clears |

Capture surface types (`PLANNER_ENTRY_TYPES`): `text`, `file`, `photo`, `link`,
`voice`, `document` — all land in the Inbox for classification before any of the
above obligations exist.

---

## 4. De-duplication (one obligation, one queue)

- **Action items:** one active item per `(organization_id, type, source_type,
  source_id)` — UNIQUE `action_items_dedupe_idx` (migration `048`, rebuilt in
  `097`). A signal seen twice updates the existing item; it does not create a
  second.
- **Notifications:** one delivery per `(organization_id, user_id,
  deduplication_key)` — UNIQUE partial `notifications_delivery_dedupe_idx`
  (migration `073`).
- **New payment cycle:** the dedup key must include the cycle's
  `billing_period_key`, so a renewal opens a NEW item rather than reviving the
  resolved one (Sprint 3 unit 3.4 verifies this).

---

## 5. Failure visibility

Every background failure MUST become a visible, recoverable state — never a silent
drop:

- **Extraction/AI** (`document_extractions.status = 'failed'`, migration `051`) →
  a `risk_detected` action item on the document whose `target_url` offers
  **retry** (implemented: `detectFailedExtractions` in the generator; self-clears
  via `reconcileStaleActionItems` once the latest extraction is no longer failed).
- **Automation** (`status = 'failed'`, migration `040`) → an action item with a
  clear next step: retry / fix input / contact support.
- **Snoozed** items return to `open` at `snoozed_until` (migration `075` restore
  path).
- **Mandatory billing/security** cannot be hidden by notification preferences.
  Two guarantees enforce it
  (`modules/notifications/delivery/notification-mandatory.test.ts`):
  (a) the **durable in-app record + the action item are created unconditionally**
  for every notification — no category mute or quiet-hours setting suppresses the
  bell/history; (b) a notification delivered with `mandatory: true` also has its
  **push** bypass the category mute and quiet hours, while a non-mandatory push
  still respects them. The disruptive push/audio channel is otherwise suppressible
  by design (see `NOTIFICATION_POLICY.md`); the durable record is not.
  `mandatory` is **derived** for billing signals — `isMandatoryNotification`
  treats any `payment`/`subscription` notification at `high`/`critical` priority
  as mandatory automatically, so no caller has to set the flag for those. It stays
  an explicit escape hatch for a **security/system** producer on the generic
  `action_center` category (none exists today; a future one must pass
  `mandatory: true`).

---

## 6. Navigation decision (GAP-C — RESOLVED)

**Decision (Sprint 3): Home = Action Center.** `/dashboard` (the Action Center)
is now the visible **Home** section — "what needs my attention today?" is the
landing surface, no longer hidden. The metrics roll-up folded into Home
(`/dashboard/overview` permanently redirects to `/dashboard`; its summaries also
live in each module). **Inbox** stays a distinct section (Capture / Review) — the
canonical semantics in §1 keep Inbox (classify) ≠ Action Center (act).

Six-section primary nav: **Home · Work · Money · Documents · Inbox · Settings**.
This deliberately diverges from the roadmap §5 wording (which lists Home and
Action Center as two separate sections): they are the same surface here, matching
the Phase A architecture (`/dashboard` *is* the Action Center).

---

## 7. Counters

Attention/notification counters (`NotificationCounters`) are scoped to the active
organization on the server; cross-org access returns zero. Unit 3.4 adds the
regression test.
