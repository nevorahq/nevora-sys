# Product Copy — Nevora Business OS

> How Nevora talks about itself: positioning, audience, what the copy may and
> may not promise, and the rules for writing it. **This file holds no shipped
> strings** — the previous version copied landing headlines and drifted within
> weeks. The strings live in code (see *Where copy lives*); this file is the
> brief they are written against. Last reviewed 2026-09-29.

## Positioning

Nevora is **one workspace where small-business work arrives from anywhere and
becomes a clear next step — with the owner keeping the final word.**

Things are sent from wherever the user already is (the app, Telegram, Slack,
a forwarded email, a photo or a receipt QR code). Nevora drafts a task or an
expense and files it in the right project; nothing changes until the user
confirms. The Action Center then shows what needs attention today.

It is **not** a CRM, an ERP, an accounting system or an autonomous AI agent.

Core line (en / ru / ro): *Capture anything. Confirm what matters.* ·
*Добавляйте что угодно. Подтверждайте главное.* · *Adaugă orice. Confirmă ce contează.*

## Who it is for

Freelancers and small teams who run their own tasks, money and subscriptions,
and want less typing and fewer scattered tools — not a heavy all-in-one suite.

## What the copy may promise

Only what works in production today. Each claim below is live and, where
marked, pinned by a test that fails the build if it stops being true.

| Claim | Backed by |
| --- | --- |
| Capture from the app (text, photo, document, receipt scan), Telegram, Slack and email forwarding | ADR 002; live-smoked for Telegram text and email |
| A note becomes a task draft with a date and a project; a receipt or invoice becomes an expense draft | Inbox pipeline, document extraction |
| Moving a Slack/email capture to another project teaches a rule for that source | Migration `125` |
| Nothing is created, posted or paid without confirmation | `test/release-invariants.test.ts` |
| Marking a subscription payment paid twice records it once | `test/release-invariants.test.ts` |
| Reading a notification does not resolve the work behind it | `test/release-invariants.test.ts` |
| The AI writes only drafts; it cannot post money, mark paid, change plans or permissions, or delete data | `test/ai-governance.test.ts` |
| Workspaces are isolated row by row | `lib/security/require-app-access.test.ts` |
| Analytics events carry no document text, file names or emails | `test/analytics-privacy.test.ts` |
| The whole product is in English, Russian and Romanian | Dictionaries + landing content |
| Private beta: 14-day free trial, no card, paid plans switch on later | `modules/billing/plan-catalog.ts`, `BILLING_MODE=private_beta` |

## What the copy must not promise (yet)

- **Voice notes** — transcription is built but the provider account is unfunded.
- **Files from Slack** — Slack capture is text only.
- **Paid checkout** — implemented, but off in private beta; pricing shows
  "Available after beta".
- **Automatic acceptance** of drafts — explicitly not decided (ADR 002).
- **A second workspace** per account during beta.
- **Analytics and AI insight pages** — they exist but are not linked from the app.
- **CRM, clients, leads, booking** — paused and closed; never on the landing,
  pricing or trial.
- Bank sync, accounting/tax features, anything "autonomous".

Before adding a claim, move it to the table above with its evidence.

## Writing rules

- **Honest, founder-led, plain.** The contact section speaks in first person
  singular ("I read every message").
- **No invented proof:** no fake numbers, customers, reviews, logos or discounts.
  Preview data is labelled as sample data.
- **Confirm-first language:** Nevora *prepares, suggests, drafts*; the user
  *confirms, accepts, decides*. Never "Nevora pays / books / decides".
- **AI is an assistant**, not an agent. Say what it may do and what it may never
  do alone.
- **One glossary in every language** — the terminology table in
  [`CLAUDE.md`](../CLAUDE.md) (Action Center, Inbox, Workspace, Finance, AI…).
  No mixed-language sentences; the brand `Nevora Business OS` is never translated.
- **All three locales change together.** A claim that exists in one language
  exists in all three.

## Where copy lives

| Surface | Source |
| --- | --- |
| Landing (all sections, preview, FAQ, contacts) | `modules/landing/constants/landing-content.ts` |
| Pricing — stable data (prices, limits) | `modules/billing/plan-catalog.ts` |
| Pricing — localized presentation | `modules/billing/plan-catalog.i18n.ts` (English defaults pinned by tests) |
| App interface | `shared/i18n/dictionaries/{en,ru,ro}.ts` |
| Bot and channel replies (Telegram, Slack, email) | `channels.*` keys in the dictionaries |
| Legal pages | `modules/legal` |

When the product changes what it can do, update the landing and this file's
two lists in the same PR.
