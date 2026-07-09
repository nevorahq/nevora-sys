# Phase D Commercial SaaS Readiness

Phase D uses one commercial catalog in `modules/billing/plan-catalog.ts` for the
pricing matrix, checkout selection, feature gates, limits, and upgrade prompts.

## Paddle Setup

- `BILLING_PROVIDER=paddle`
- `BILLING_MODE=paid_beta` or `BILLING_MODE=production`
- `PADDLE_ENV`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_PRICE_STARTER_MONTHLY`
- `PADDLE_PRICE_STARTER_YEARLY`
- `PADDLE_PRICE_PRO_MONTHLY`
- `PADDLE_PRICE_PRO_YEARLY`
- `PADDLE_PRICE_BUSINESS_MONTHLY`
- `PADDLE_PRICE_BUSINESS_YEARLY`

Checkout redirects are only UX. Local access changes only after the verified
Paddle webhook writes through `apply_billing_provider_event`.

## QA Checklist

- [ ] New user can view `/pricing`.
- [ ] New user can start the trial from registration/onboarding.
- [ ] A repeat trial shows "You already used your trial. Choose a plan to continue."
- [ ] Paid checkout can be created only for paid Paddle Price IDs.
- [ ] Checkout success redirect alone does not change access.
- [ ] Paddle subscription webhook updates subscription state.
- [ ] Settings -> Billing shows current plan, status, renewal/trial dates, usage, and portal CTA.
- [ ] Document processing limit blocks extraction with an upgrade prompt.
- [ ] AI suggestions limit blocks generation through the existing AI request ledger.
- [ ] Team member limit blocks invitations server-side.
- [ ] Storage limit blocks uploads server-side.
- [ ] Automation run limit skips new handlers and logs a commercial skipped reason.
- [ ] Duplicate webhook returns accepted duplicate and does not mutate state twice.
- [ ] Out-of-order webhook is accepted but ignored.
- [ ] Customer portal opens from billing settings.
- [ ] Failed payment/past_due state is visible as restricted access.
- [ ] Cancel-at-period-end remains active until the provider period ends.
- [ ] Pricing matrix features and limits match `plan-catalog.ts`.
