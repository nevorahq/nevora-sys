# Landing / Marketing Alignment Findings — Nevora Business OS

**Date:** 2026-07-05
**Scope:** `modules/landing/*` (public marketing surface)
**Rule:** paused modules (CRM, Leads, Clients, Deals, Contacts, Pipelines,
Booking) must not be presented as active features/quotas without a reactivation
decision. No AI-autonomy or automatic-money-posting claims.

**Mitigating fact:** every plan CTA is currently `"Coming soon"`
(`landing-content.ts:122,160,...`) and there is no payment provider, so nothing
is purchasable yet. The findings below are about *copy accuracy* before public
launch, not active mis-selling.

---

## Findings

| Location (evidence) | Current copy | Problem | Roadmap-compliant replacement |
|---|---|---|---|
| `landing-content.ts:104,139,177` | "Up to 100 / 2,000 / 10,000 CRM clients" | CRM is paused; quota implies active feature | Remove these lines, or move under a clearly-labelled "Planned / not in current release" group |
| `landing-content.ts:105,140,178` | "Up to 50 / 1,000 / 5,000 deals" | Deals paused | Remove or relabel as planned |
| `landing-content.ts:113` | "Basic CRM" (Start features) | Paused feature sold as included | Replace with an active capability, e.g. "Basic analytics" (already present) — drop the CRM line |
| `landing-content.ts:148–150` | "Full CRM", "Clients and contacts", "Deals pipeline" (Pro) | Paused features headlined on the flagship plan | Remove; replace with active differentiators: "Advanced money categorization", "Document extraction", "Relations between tasks, money & documents" |
| `landing-content.ts:187` | "Shared CRM" (Business) | Paused | Remove or relabel as planned |
| `landing-content.ts:244,253,279,288,290,317,327` (RU) | "CRM-клиентов", "Базовая CRM", "Полная CRM", "Pipeline сделок", "Общая CRM" | Same issue in Russian copy | Mirror the English corrections |

### What can stay (already roadmap-safe)

| Location | Copy | Why it's fine |
|---|---|---|
| `landing-content.ts:378` | "...Client and CRM workflows are **part of the product direction**; the current focus is tasks, money, documents, subscriptions, settings and the workflow automation foundation." | Correctly frames CRM as future direction, not current feature |
| `landing-content.ts:544` (RU) | equivalent hedged framing | Same |
| Hero / philosophy / value sections | focus on tasks, money, documents, subscriptions, decisions | On-scope |
| `trialNote.lead` (`:430`) | "try Nevora Business OS for 14 days with up to 500 MB of storage" | Accurate trial claim |

### Claims to avoid entirely

- Any wording implying **autonomous AI execution** (AI acts without review) — none found currently; keep it that way. AI is suggestion-only (`review-ai-suggestion.action.ts`).
- Any wording implying **automatic money transaction creation** from documents/subscriptions — none found; the product is explicitly confirm-first. Do not add "auto-books your expenses" style copy.
- Booking as a live feature — Booking is paused/hidden; do not add it to plans or hero.

### Claims to keep cautious

- Analytics / AI: present as "basic/standard/advanced summaries" (current copy) rather than deep BI — matches actual implementation.
- Plan quotas for **active** modules (tasks, documents, subscriptions, money transactions, AI requests, members, storage) are backed by real limit enforcement (`plan_limits`, migrations 033/071/072) and can stay — only strip the CRM/deals rows.

---

## Recommended Action

1. Remove or clearly quarantine every CRM/Deals/Clients line from `plans` in
   `landing-content.ts` (EN + RU) before public launch.
2. Backfill each plan's `features`/`limits` with **active** capabilities so plans
   still look differentiated (money intelligence, document extraction, relations,
   subscription payment workflow, capture inbox, developer access).
3. Keep the hedged "product direction" framing for CRM in philosophy/value copy.
4. Re-verify after edit that no paused-module noun appears in any `features` or
   `limits` array.

*No copy was changed by this audit — this is a findings document only.*
