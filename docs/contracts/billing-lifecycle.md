# Billing Lifecycle Contract

**Status:** Private Beta by default; Paddle is the only external paid billing provider.

## Sources Of Truth

- Paddle is the payment, merchant-of-record, customer, and subscription lifecycle provider.
- The local billing catalog (`modules/billing/plan-catalog.ts`) is the source of truth for product entitlements, limits, and public pricing copy.
- Local usage counters and live usage queries are the source of truth for usage enforcement.
- Paddle billing events must never be used as accounting facts for Nevora business money flows.

## Activation Rules

- Paid plan activation happens only through verified Paddle webhooks.
- Checkout success redirects are display-only. They must never mark a subscription active.
- Customer Portal changes must return through Paddle webhooks before local access changes.
- In `BILLING_MODE=private_beta`, paid checkout and Customer Portal are unavailable by design.

## Tenant Boundary

- Billing data is organization-scoped.
- Interactive billing actions resolve the active organization server-side.
- Client payloads must not be trusted for `organization_id`.
- Owner/admin with `billing.manage` may start checkout or portal sessions.
- Members without billing permission must be denied before provider calls.

## Paddle Runtime Requirements

Runtime-ready mode requires all of the following outside the repository:

- `BILLING_MODE=paid_beta` or `BILLING_MODE=production`
- `BILLING_PROVIDER=paddle`
- `PADDLE_ENV`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- Paid plan Price IDs for Starter, Pro, and Business monthly/yearly intervals

Missing Paddle runtime config in production is a release blocker.

## Webhook Rules

- The webhook route reads the raw request body and verifies the Paddle signature.
- Invalid signatures are rejected.
- Provider events are idempotent by `(provider, provider_event_id)`.
- Duplicate delivery must not duplicate subscription updates.
- Out-of-order events are ignored rather than rewinding local state.
- Service-role access is reserved for webhook/system boundaries, not interactive application logic.

## Entitlements And Usage

- Paddle status maps into local `billing_subscriptions.status`.
- Local plan slug resolves entitlements and limits.
- `featureGateService` and `usageService` enforce document processing, AI suggestions, and storage upload boundaries.
- Limit-denied flows should show an upgrade/request-access prompt at the value boundary.
- CRM and Booking are paused and must not participate in active monetization claims.

## Reconciliation

- Reconciliation compares local provider IDs, status, plan, current period, and cancellation flags against Paddle.
- Reconciliation is diagnostic/admin/cron work, not a replacement for normal webhook flow.
- Repairs must be idempotent and leave an audit trail.
