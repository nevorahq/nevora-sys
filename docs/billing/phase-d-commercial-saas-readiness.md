# Phase D Commercial SaaS Readiness

Phase D uses one commercial catalog in `modules/billing/plan-catalog.ts` for the
pricing matrix, checkout selection, feature gates, limits, and upgrade prompts.

## Stripe Setup

- `BILLING_PROVIDER=stripe`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_BUSINESS_MONTHLY`
- `STRIPE_PRICE_BUSINESS_YEARLY`

Checkout redirects are only UX. Local access changes only after the verified
Stripe webhook writes through `apply_billing_provider_event`.

## QA Checklist

- [ ] New user can view `/pricing`.
- [ ] New user can start the trial from registration/onboarding.
- [ ] A repeat trial shows “You already used your trial. Choose a plan to continue.”
- [ ] Paid checkout can be created only for starter/pro/business price IDs.
- [ ] Checkout success redirect alone does not change access.
- [ ] `checkout.session.completed` or `customer.subscription.updated` webhook updates subscription state.
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
