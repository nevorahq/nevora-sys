# Smoke Test Checklist — Nevora Business OS

**Status:** Canonical · **Last updated:** 2026-07-08 (Phase A)
**Run:** by a human, against the deployed environment, after every release.

Structural tests in CI prove a forbidden construct is *absent*. This checklist
proves the system *behaves*. Both are required. Record evidence (screenshot, row
id, or curl output) for every ⚑ item — those are the release blockers.

Set up: one org with ≥1 subscription, ≥1 document, ≥1 overdue task, and a second
org owned by a different user (for isolation checks).

---

## 1. Auth & tenancy

- [ ] Register a new user → lands on `/onboarding`.
- [ ] Log in / log out.
- [ ] Create an organization → lands on `/dashboard`.
- [ ] User in ≥2 orgs can switch active org; data changes accordingly.
- [ ] ⚑ **Cross-org isolation.** Copy a record id (task / transaction / document)
      from org A. As a user of org B, open its detail URL directly.
      **Expect:** safe not-found, never the record, never a 500.
- [ ] ⚑ Active organization is resolved **server-side**. Tamper with any
      client-supplied `organization_id` in a request body. **Expect:** ignored or
      rejected — never honoured.

## 2. Action Center-first dashboard

- [ ] ⚑ `/dashboard` renders the **Action Center** (heading "Action Center",
      summary strip, grouped feed). It is not a metrics roll-up.
- [ ] The dashboard visibly answers "what needs my attention today?": Needs
      Attention / Due Today / Upcoming / Overdue / Snoozed / Recently Resolved.
- [ ] `/dashboard/overview` shows the secondary metrics roll-up.
- [ ] `/dashboard/actions` (old bookmark) redirects to `/dashboard`.
- [ ] Sidebar shows the Action Center first; **no CRM, no Booking** entry.
- [ ] Empty state: a brand-new org shows an action-driven empty state, not a blank page.
- [ ] Loading + error states render (throttle the network; break the query).
- [ ] ⚑ Action Center items are org-scoped: org A's items never appear in org B.
- [ ] Resolve an action item → it leaves the active feed and appears under
      Recently Resolved.
- [ ] Snooze an item → hidden until `snoozed_until`; **not** resolved.

## 3. Tasks / Projects

- [ ] Create, edit, assign, complete a task.
- [ ] Create a project; attach tasks.
- [ ] Change a task due date → recorded in due-date history.
- [ ] ⚑ Completing a task posts **no** money transaction and marks **no**
      obligation paid. Check `money_transactions` count before/after.

## 4. Financial Tasks

- [ ] `/dashboard/tasks/financial` lists one-off financial obligations.
- [ ] Mark a financial task paid → exactly one posted transaction.
- [ ] ⚑ Click **Mark as paid** twice (double-click, then refresh and click again).
      **Expect:** still exactly one transaction; second call reports already-paid.
- [ ] Skip / dismiss a financial task → closes it, posts nothing.

## 5. Money / Money Intelligence

- [ ] Create an account; create income and expense transactions.
- [ ] Internal transfer between two accounts → one `type='transfer'` row.
- [ ] Planned transaction appears in forecasts, **not** in the posted ledger.
- [ ] Post a planned transaction explicitly → becomes posted.
- [ ] Rule-based categorization applies; an AI category suggestion is
      **suggested**, requiring confirmation.
- [ ] ⚑ No screen implies AI posts or pays anything automatically.

## 6. Documents

- [ ] Upload a document (PDF + image).
- [ ] Extraction runs → produces a **draft/review** item.
- [ ] ⚑ Extraction posts **no** transaction on its own.
- [ ] Confirm the draft expense → exactly one posted transaction.
- [ ] Reject the draft → nothing posted.
- [ ] Extraction failure path: upload a corrupt file → surfaces "needs review",
      does not hang, does not post.
- [ ] Low-confidence AI suggestion is shown as a suggestion, not applied.

## 7. Subscriptions & payment workflow

- [ ] ⚑ Creating a subscription posts **no** money transaction.
- [ ] ⚑ Attaching a document to a subscription posts **no** money transaction.
- [ ] A planned payment cycle + payment task are created.
- [ ] Subscription payment review appears in the Action Center.
- [ ] Mark the cycle paid → one expense, task completed, subscription advanced,
      next cycle opened.
- [ ] ⚑ **Idempotency.** Click Mark as paid twice.
      **Expect:** one transaction, `already_paid: true` on the second call, and
      the schedule advances exactly once.

## 8. Capture Inbox

- [ ] `/dashboard/inbox` accepts a raw capture.
- [ ] AI produces a suggestion; accept / edit / reject all work.
- [ ] Accepting routes through the existing module service (task/doc/etc.).
- [ ] ⚑ Accepting a capture never posts money directly.
- [ ] Pending-AI and failed-extraction states are visible and actionable.
- [ ] Captures are owner-scoped: a member sees only their own.

## 9. Notifications

- [ ] Bell shows unread count; a notification opens its target.
- [ ] **Mark all as read** → unread badge goes to 0.
- [ ] ⚑ **Read is not resolved.** With an overdue task, an overdue subscription
      renewal, and an unreviewed document present, press *Mark all as read*.
      **Expect:** unread = 0, and the Action Center **still** shows every one of
      those obligations. Overdue count unchanged.
- [ ] Push notification (if enabled) deep-links into `/dashboard`.

## 10. Settings / Members / Billing / Developer

- [ ] Profile, workspace, notification settings save.
- [ ] Invite a member; accept via invite link; the link is single-use.
- [ ] Remove a member; owner cannot be removed.
- [ ] Plan limits enforced (hit a limit → clear, honest message).
- [ ] Trial banner reflects real trial state; an expired trial is read-only.
- [ ] ⚑ Trial reuse: a second org by the same identity does **not** get a new trial.
- [ ] ⚑ Billing mode is honest:
      - Private Beta: plan buttons show request/contact/private-beta state; no
        checkout session is created; Customer Portal is unavailable.
      - Stripe mode: owner/admin can start Checkout only when all Stripe Price IDs
        and secrets are configured.
- [ ] ⚑ Checkout success redirect does **not** activate a paid plan. Local paid
      state changes only after a verified webhook updates `billing_subscriptions`.
- [ ] ⚑ Stripe webhook rejects an invalid signature and accepts a valid event
      idempotently; duplicate event delivery does not duplicate subscription updates.
- [ ] Customer Portal opens only for authenticated owner/admin with an existing
      Stripe customer id, or returns an honest private-beta/config error.
- [ ] Cancel subscription in Stripe Customer Portal → webhook updates local status;
      no app action mutates subscription state directly.
- [ ] Developer Access: create/revoke an API key; `/api/v1/me` honours it.

## 11. Paused-module gates ⚑

All must return **404** (not 403, not a redirect to login for the dashboard ones):

- [ ] `GET /dashboard/crm`
- [ ] `GET /dashboard/booking`
- [ ] `GET /dashboard/booking/hosts` (and `/services`, `/availability`, `/requests`)
- [ ] `GET /booking/<any-org-slug>` — public surface
- [ ] `GET /booking/<org>/<host>` — public surface
- [ ] `GET /api/public/booking/hosts?organizationSlug=x` (+ `page`, `services`,
      `availability`, `client-check`)
- [ ] `POST /api/public/booking/requests`
- [ ] `GET /api/internal/booking/availability-rules?hostId=x`
- [ ] ⚑ **Server Action gate.** A hidden page is not a gate. Confirm a direct POST
      to a CRM/Booking Server Action is rejected before any mutation. Easiest
      check: with `NEVORA_ENABLE_CRM` unset, no `clients` row can be created by
      any means from the app.

## 12. Public copy

- [ ] Landing mentions no CRM, Deals, Clients, Contacts, Pipelines, or Booking.
- [ ] Landing makes no autonomous-AI or automatic-posting claim.
- [ ] Pricing matrix lists only modules that are actually gated/available.
- [ ] Every pricing feature maps to a real entitlement (no phantom features).

## 13. Ops

- [ ] ⚑ `curl -i https://<host>/api/health` **without cookies** → 200 `healthy`.
      Test with `curl`, never in a logged-in browser tab: the route reads the
      session from cookies, and monitoring sends none. A browser-only check once
      masked a bug where the probe hit a table `anon` cannot read, making the
      endpoint answer 503 to every load balancer while looking fine to a human.
- [ ] ⚑ `curl -i https://<host>/api/cron/reminders` (no auth header) → **not 200**.
      Repeat for `extraction-sweep`, `subscription-sweep`, `suggestions-sweep`,
      `trial-sweep`.
- [ ] Cron runs complete within one cycle; failures logged.
- [ ] ⚑ Migration baseline matches `supabase/migrations/` (tree: `000`–`099`,
      99 files, `054` a known gap; next free `100`).
- [ ] ⚑ `099_planner_confirmation_exactly_once.sql` applied **before** the app code
      that writes `todos.source_suggestion_id`. Confirm a draft twice: the second
      confirm must resolve to the SAME task id, not create a second task.
- [ ] ⚑ `098_booking_anon_lockdown.sql` applied on remote. Verify from the outside,
      with the **public anon key**, not with service-role:
      `curl "$URL/rest/v1/booking_pages?select=id" -H "apikey: $ANON_KEY"` → must
      NOT return rows. Repeat for `booking_host_profiles`, `booking_services`,
      `booking_host_services`. Then
      `curl -X POST "$URL/rest/v1/rpc/check_client_booking_conflict_public" …` →
      must be `permission denied`, not `{"conflict": …}`.
- [ ] Billing subscription reconciliation: `billing_subscriptions` rows agree with
      trial/plan/provider state; no org is both `trialing` and `expired`.

---

## Sign-off

| Field | Value |
|---|---|
| Release / commit | |
| Environment | |
| Run by | |
| Date | |
| ⚑ blockers all green? | |
| Deviations / follow-ups | |
