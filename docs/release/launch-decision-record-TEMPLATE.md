# Launch decision record — <DATE>

**Status:** TEMPLATE — copy to `launch-decision-<YYYY-MM-DD>.md` and fill in.
This is the durable record of the go/no-go call: what was decided, by whom, and
on what evidence. A launch must not happen without this record.

## Decision

> **<Launch | Limited beta extension | No launch>**

| | |
|---|---|
| Date | `<YYYY-MM-DD>` |
| Decision owner | `<name / role>` |
| Beta report | [`beta-report-<date>.md`](./beta-report-<date>.md) |
| Launch gate | [`launch-gate-checklist.md`](./launch-gate-checklist.md) |

## Safety gate result

Every §1 row of the launch gate must be YES to launch. Record the state of each:

- [ ] No open P0/P1
- [ ] Migration baseline verified
- [ ] Financial invariants (confirm-first, canonical states, idempotent mark-as-paid)
- [ ] Notification / attention invariants
- [ ] AI governance + analytics privacy
- [ ] Tenant isolation + CRM/Booking fail-closed
- [ ] Background-job reliability (auth/retry/terminal/owner)
- [ ] Smoke + rollback verified

Any NO → the only valid decision is **No launch** (or **Limited beta extension**
if the failing rows are activation, not safety).

## Activation gate result

| Key workflow | Rate | Target met? |
|---|---:|:---:|
| Capture → accept an Inbox item | % | ☐ |
| Create → complete a task | % | ☐ |
| Document → confirmed expense | % | ☐ |
| Subscription → paid cycle | % | ☐ |

## Rationale

`<why this decision, in a few sentences — the specific evidence that made it>`

## Follow-ups / conditions

`<if Limited beta / No launch: what must change before the next gate, and when>`
