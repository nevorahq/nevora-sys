# Launch gate checklist (Sprint 6 — S6.3)

**Status:** Canonical GO/NO-GO gate for the public launch decision. Every safety
row is backed by a test or a contract that fails the build if broken; every
activation row is filled from the controlled beta. Kept honest by
`test/launch-gate.test.ts`.

Decision options (roadmap §Sprint 6): **Launch** · **Limited beta extension** ·
**No launch**. Record the outcome in
[`launch-decision-record-TEMPLATE.md`](./launch-decision-record-TEMPLATE.md).

---

## 1. Safety gate (hard — a single NO blocks launch)

| Area | Evidence | Status |
|---|---|---|
| No open P0/P1 | [`p0-p1-issue-register.md`](./p0-p1-issue-register.md) | ☐ |
| Migration baseline verified | [`release-checklist.md`](./release-checklist.md) §0 (`000–109`) | ☐ |
| Confirm-first money (nothing posts implicitly) | `test/release-invariants.test.ts` + [`../contracts/financial-workflows.md`](../contracts/financial-workflows.md) | ☐ |
| Canonical financial states | `test/financial-state-contract.test.ts` + [`../contracts/financial-state-machine.md`](../contracts/financial-state-machine.md) | ☐ |
| Mark-as-paid idempotent (repeat/concurrent) | `test/release-invariants.test.ts` (subscription + financial-task) | ☐ |
| Notification read ≠ resolved | `test/release-invariants.test.ts` + [`../contracts/notification-lifecycle.md`](../contracts/notification-lifecycle.md) | ☐ |
| Attention model canonical | [`../contracts/attention-model.md`](../contracts/attention-model.md) + `test/attention-model-contract.test.ts` | ☐ |
| AI cannot act on its own | `test/ai-governance.test.ts` + [`../contracts/ai-governance.md`](../contracts/ai-governance.md) | ☐ |
| Analytics/events carry no secrets | `test/analytics-privacy.test.ts` + [`../contracts/analytics-privacy.md`](../contracts/analytics-privacy.md) | ☐ |
| Tenant isolation / cross-org safe-not-found | `lib/security/require-app-access.test.ts`, `lib/entity-links/verify-entity-organization.test.ts` | ☐ |
| CRM/Booking fail closed | `shared/config/paused-modules.coverage.test.ts` | ☐ |
| Background jobs: auth + retry + terminal + owner | [`job-reliability-register.md`](./job-reliability-register.md) | ☐ |
| Smoke report exists (env/commit/migrations/results) | [`smoke-test-checklist.md`](./smoke-test-checklist.md) + a filled proof report | ☐ |
| Rollback + incident procedures verified | [`rollback-plan.md`](./rollback-plan.md), [`../runbooks/rollback.md`](../runbooks/rollback.md) | ☐ |

## 2. Activation gate (from the controlled beta)

Four key workflows a new SMB user must be able to complete unaided. Each is
measured by a domain-event milestone (see
`modules/onboarding/services/activation-milestones.ts`):

| Key workflow | Milestone event | Beta completion rate |
|---|---|---|
| Capture → accept an Inbox item | `planner_suggestion.accepted` | ☐ ____% |
| Create → complete a task | `task.completed` | ☐ ____% |
| Document → confirmed expense | `financial_suggestion.confirmed` | ☐ ____% |
| Subscription → paid cycle | `financial_obligation.paid` | ☐ ____% |

Targets (roadmap §4, revisable after two beta weeks; safety guardrails are not):
new orgs completing a first meaningful workflow in 24h ≥ 60%; median time to first
result ≤ 15 min; Action Center items resolved in 7 days ≥ 70%.

## 3. Owners (Phase 0 / reliability register)

| Role | Owner |
|---|---|
| Release / launch decision | ☐ TBD |
| Incident | ☐ TBD |
| Billing / data | ☐ TBD |
| Security | ☐ TBD |

## 4. Decision

- **Launch** — every §1 row is YES and §2 targets are met.
- **Limited beta extension** — §1 all YES but §2 activation targets need work.
- **No launch** — any §1 NO (open P0/P1, a broken financial/tenant invariant, or a
  critical job without recovery).

Record the outcome, owner, and date in the decision-record template.
