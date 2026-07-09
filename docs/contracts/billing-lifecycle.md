# Billing Lifecycle Contract

**Status:** Private Beta by default.

## Sources of Truth

- Stripe is the source of truth for payment and subscription lifecycle only when `BILLING_MODE=stripe`.
- The local billing catalog (`modules/billing/plan-catalog.ts`) is the source of truth for product entitlements, limits, and public pricing copy.
- Local usage counters and live usage queries are the source of truth for usage enforcement.
- Stripe must never be used as the source of accounting facts for Nevora business money flows.

## Activation Rules

- Paid plan activation happens only through verified provider webhooks.
- Checkout `success_url` is display-only. It must never mark a subscription active.
- Customer Portal changes must return through webhooks before local access changes.
- In `BILLING_MODE=private_beta`, paid Checkout and Customer Portal are unavailable by design.

## Tenant Boundary

- Billing data is organization-scoped.
- Interactive billing actions resolve the active organization server-side.
- Client payloads must not be trusted for `organization_id`.
- Owner/admin with `billing.manage` may start checkout or portal sessions.
- Members without billing permission must be denied before provider calls.

## Stripe Runtime Requirements

Stripe runtime-ready mode requires all of the following outside the repository:

- `BILLING_MODE=stripe`
- `BILLING_PROVIDER=stripe`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Paid plan Price IDs for Starter, Pro, and Business monthly/yearly intervals

Missing Stripe runtime config in production is a release blocker for Stripe mode.

## Webhook Rules

- The webhook route reads the raw request body and verifies the Stripe signature.
- Invalid signatures are rejected.
- Provider events are idempotent by `(provider, provider_event_id)`.
- Duplicate delivery must not duplicate subscription updates.
- Out-of-order events are ignored rather than rewinding local state.
- Service-role access is reserved for webhook/system boundaries, not interactive application logic.

## Entitlements And Usage

- Stripe status maps into local `billing_subscriptions.status`.
- Local plan slug resolves entitlements and limits.
- `featureGateService` and `usageService` enforce document processing, AI suggestions, and storage upload boundaries.
- Limit-denied flows should show an upgrade/request-access prompt at the value boundary.
- CRM and Booking are paused and must not participate in active monetization claims.

## Reconciliation

- Reconciliation compares local provider IDs, status, plan, current period, and cancellation flags against Stripe.
- Reconciliation is diagnostic/admin/cron work, not a replacement for normal webhook flow.
- Repairs must be idempotent and leave an audit trail.
