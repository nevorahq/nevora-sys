# AI governance contract (Sprint 5 — S5.1)

**Status:** Normative. Nevora is **AI-assisted, not AI-controlled**. This document
is the contract for what AI may and may not do. Every clause is asserted by
`test/ai-governance.test.ts`, which fails the build if AI code gains a forbidden
side effect.

Companion docs: [`financial-workflows.md`](./financial-workflows.md) (confirm-first
money), [`attention-model.md`](./attention-model.md) (AI suggestions overlay).

---

## 1. What AI MAY do

AI may **classify, extract, suggest, and explain**:

- Inbox: parse captured input into a suggested intent.
- Documents: extract fields and propose a draft.
- Money: suggest a category or explain a number.
- Work: suggest tasks.
- Action Center: explain why an item needs attention and the next step.

Its output is always a **suggestion for a human to accept, edit, or reject** — a
candidate, never a fact. Producing a suggestion writes only to AI-owned tables
(`ai_requests`, `ai_insights`, `ai_summaries`, `ai_recommendations`) — telemetry
and review queues, never a domain fact.

## 2. What AI MUST NOT do without explicit authorized confirmation

AI must never, on its own:

- **post income or an expense** — no write to `money_transactions`;
- **mark an obligation paid** — no `mark_subscription_payment_paid` /
  `mark_financial_task_paid`, no `financial_status = 'paid'`;
- **change a billing plan** — no write to `billing_subscriptions`, no `changePlan`;
- **change permissions** — no write to `memberships` / roles;
- **delete critical data** — no `.delete()` on money, tasks, documents,
  subscriptions, organizations, or memberships (deleting its own stale
  `ai_recommendations` before regenerating is allowed);
- **create organization-wide rules** — no `category_rules` / automation rule
  creation.

## 3. How accepted AI actions execute

When a user accepts an AI suggestion, the **existing module service** performs
the action, under the same authorization and confirm-first rules as a manual
action. AI never has a privileged write path:

- a suggested category is applied by the moneyflow categorization service;
- a suggested draft is posted only by `confirmFinancialSuggestion` (explicit
  confirm);
- a suggested task is created by the tasks service.

The pure suggestion helpers (`modules/moneyflow/services/ai-category-suggestion.ts`,
`modules/planner/services/detect-planner-intent.ts`) perform **zero** database
writes — they compute and return a suggestion; the caller persists it through the
normal, gated path.

## 4. Enforcement

`test/ai-governance.test.ts` scans every AI file and asserts: it writes only to
the AI-owned allowlist, never references a forbidden table or RPC, and the pure
suggestion helpers stay write-free. Combined with the confirm-first invariants in
`test/release-invariants.test.ts`, this pins the whole "AI cannot act on its own"
guarantee to the build.
