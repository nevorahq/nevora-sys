# Start plan audit — Nevora Business OS

Audit date: 2026-06-21

## Ready for Start

| Area | Evidence | Status |
| --- | --- | --- |
| Auth, registration and onboarding | Supabase auth plus `features/onboarding` | Ready |
| Organizations, workspaces and memberships | multi-tenant migrations 001–005; default workspace provisioning | Ready |
| Start plan and trial | `plans`, `billing_subscriptions`, migrations 024 and 027 | Ready |
| Tasks | organization/workspace-scoped `todos`, server actions and events | Ready |
| Basic CRM | clients, contacts, deals, activities and basic pipeline | Ready |
| Money tracking | accounts, categories, transactions and cashflow RPC | Ready |
| Subscription tracking | organization-scoped tracked subscriptions | Ready |
| Documents | document metadata, attachments and tenant-scoped paths | Ready |
| Basic analytics | organization-scoped dashboard metric queries | Ready |
| Basic AI | summaries, insights and recommendations | Ready |

## Start enforcement added in migration 033

- Start price: EUR 9/month, one included member, EUR 5 for each additional
  member, maximum three members.
- Database triggers enforce workspace, task, client, deal, document, tracked
  subscription, money transaction, attachment-storage and AI-request limits.
  Server Actions remain responsible for friendly error messages.
- `ai_requests` is the monthly quota source of truth. Generated output rows are
  no longer used as a proxy for requests.
- A cancelled paid plan stays writable through `current_period_end`; paused and
  expired states are read-only.
- The Start feature matrix is stored on the plan row for a single source of
  truth and future UI/server gates.

## Billing activation decision

The project has no payment-provider checkout or webhook yet. A dashboard action
must therefore **not** grant a paid plan. The UI now explains that activation
requires payment confirmation; Start can be activated for an early MVP by an
authorized back-office database operation after payment is verified.

Before enabling self-service checkout, add a provider customer/subscription
mapping and make the provider webhook the only code path that transitions a
subscription to `active` on Start.

## Release checklist

1. Apply migrations through `033_start_plan_enforcement.sql` to the target
   Supabase project.
2. Confirm a Start organization can create its allowed resources and receives
   `plan_limit_reached` at the next insertion.
3. Confirm the storage bucket policy only accepts paths beginning with
   `documents/<organization_id>/`; the metadata check already enforces this in
   the Server Action.
4. Configure the checkout webhook before exposing automated plan activation.

## Known non-blocking follow-up

The repository has pre-existing lint warnings (25 at audit time), mostly unused
imports and CRM expression warnings. They do not block TypeScript compilation,
but should be cleared as a separate code-quality pass.
