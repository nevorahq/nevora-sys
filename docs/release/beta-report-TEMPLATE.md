# Controlled beta report — <DATE>

**Status:** TEMPLATE — copy to `beta-report-<YYYY-MM-DD>.md` and fill in. Do not
report a result you did not observe; use explicit states (verified / failed / not
run / needs production-owner).

## 1. Environment

| | |
|---|---|
| Environment | production-like: `<host>` |
| Commit | `<sha>` |
| Migrations applied | `000–<n>` (per release-checklist §0) |
| Billing mode | `<private_beta / …>` |
| Window | `<start> – <end>` |

## 2. Cohort

- Number of organizations: `<n>`
- Segment (target SMB profile): `<describe>`
- Recruitment method: `<describe>`

## 3. Key-workflow completion (from the activation milestones)

| Key workflow | Milestone event | Started | Completed | Rate |
|---|---|---|---|---:|
| Capture → accept an Inbox item | `planner_suggestion.accepted` | | | % |
| Create → complete a task | `task.completed` | | | % |
| Document → confirmed expense | `financial_suggestion.confirmed` | | | % |
| Subscription → paid cycle | `financial_obligation.paid` | | | % |

Source: `GET /api/internal/activation-funnel?days=<n>` (METRICS_SECRET). Numbers
are aggregate-only.

## 4. Activation headline metrics

| Metric | Result | Target |
|---|---|---|
| First meaningful workflow within 24h | % | ≥ 60% |
| Median time to first result | min | ≤ 15 min |
| Action Center items resolved in 7 days | % | ≥ 70% |
| Capture Inbox items processed in 24h | % | ≥ 80% |
| Duplicate posted transactions | | 0 |
| Confirmed cross-tenant incidents | | 0 |

## 5. Confusion points / blockers / support load

- Confusion points: `<list>`
- Blockers: `<list>`
- Support tickets / contacts: `<count + themes>`

## 6. P0/P1 found during beta

| ID | Severity | Description | Status |
|---|---|---|---|
| | | | |

Cross-reference [`p0-p1-issue-register.md`](./p0-p1-issue-register.md).

## 7. Recommendation

One of: **Launch** / **Limited beta extension** / **No launch** — with rationale.
Record the formal outcome in
[`launch-decision-record-TEMPLATE.md`](./launch-decision-record-TEMPLATE.md).
