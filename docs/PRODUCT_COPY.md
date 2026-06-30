# Product Copy — Nevora Business OS

> Canonical product positioning and the copy currently shipped on the landing
> page (`modules/landing/constants/landing-content.ts`, bilingual en/ru). Keep
> marketing, README and in-app copy aligned with this file. Tone: honest,
> founder-led, no hype — no fake numbers, fake reviews, fake discounts or logos.

## Positioning

Nevora Business OS is **not** just a CRM, a task manager or a finance tracker.
It is an **Intelligent Business System for SMB** — one place where the key parts
of a small business work together.

Core idea:

> Minimum effort. Maximum productivity. All business modules work together.
> AI helps you make decisions. The system reduces routine.

## Hero (shipped)

- **Title:** "A simple Business OS for focused work."
- **Subtitle:** "Nevora Business OS helps small businesses keep tasks, money,
  documents, subscriptions, analytics and AI in one clear system."
- **Goal line:** "less chaos, fewer scattered tools, more control over your
  working day."
- **Primary CTA:** "Start free trial" · **Secondary CTA:** "See plans"
- **Microcopy:** "14 days free. Up to 500 MB storage. No pressure to upgrade."

## Product description

The system brings the key parts of your business into one place, so you
understand faster what is happening and what needs attention. Open your
workspace, see what matters, make a decision, and move on.

## Main modules (as marketed, active now)

Tasks · Documents · Subscriptions · Money tracking · Business analytics ·
AI assistant.

**Client / CRM workflows are part of the product direction but currently
paused** — they are not marketed as an active, available feature (removed from
the capability list, the trial, and trial details). They remain in the
"Coming soon" paid tiers (Start/Pro/Business) as roadmap direction only. See
[`MODULE_STATUS.md`](./MODULE_STATUS.md).

## Who it is for

Small and medium businesses that need order without enterprise weight — people
who want a simple system that is useful before it is complex.

## Current product promise

- Bring tasks, money, documents, subscriptions and recurring work into one
  clear workspace.
- See what needs attention and act, instead of switching between scattered tools.
- An **AI assistant that helps** with summaries, insights and recommendations.

## Future product direction

- Cross-module relations and an Action Center that surfaces what to do next.
- Document automation (upload → extract → draft transaction → confirm).
- Deeper analytics and AI-driven recommendations.
- **AI-ready foundation; AI assistance is planned/scoped — not autonomous.**

## Pricing copy alignment

One trial + paid plan model. Trial: 14 days, up to 2 members, 500 MB storage,
module previews, basic analytics, limited AI assistant, no pressure to upgrade.
Real checkout is **not yet built** — pricing copy is informational and CTAs route
to registration. When checkout lands, wire CTAs to `?plan=<id>` (see the
`TODO(pricing)` in landing content). Plan limits in copy must match
`lib/billing` enforcement (Billing module).

## Copy guardrails

**Avoid:** overpromising, fake AI claims, enterprise-heavy language, excessive
complexity, "fully autonomous AI agent / AI runs your whole business".

**Prefer:** "AI-ready foundation", "AI assistance", "AI summaries and
recommendations as roadmap direction".

## Known copy ⇄ product discrepancies

- **CRM / Clients — RESOLVED (Phase 0 finalization).** CRM is Paused/hidden, so
  it is no longer presented as an active feature: removed from the landing
  capability list (`value.items`), the trial features, and trial details, in
  both en and ru. CRM is preserved only in the "Coming soon" paid tiers and in
  the long-term product direction. Soft framing used: "Client and CRM workflows
  are part of the product direction; the current focus is tasks, money,
  documents, subscriptions, settings and the workflow automation foundation."
- Contact channels in landing content are still placeholders
  (`hello@nevora.com`, `@nevora`) — replace with real channels before launch.
  *(Open follow-up — operational, does not block Phase 0.)*
