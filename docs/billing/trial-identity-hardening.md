# Trial Identity Hardening (Phase 1 — migration 089)

Builds on [Trial Reuse Protection](./trial-reuse-protection.md) (086). Goal: make
trial abuse impossible at the database level and expose a typed entitlement
contract to the app.

## What changed

**Pseudonymous billing identity (HMAC, not sha256).**
- `public.billing_identity_hash(email)` = `HMAC-SHA256(lower(trim(email)), pepper)`.
  Replaces 086's unsalted `sha256`, which was enumerable (rainbow-tableable).
- The **pepper** is a server secret, never in git. It is auto-generated at apply
  time into `private.app_secrets` (schema `private` is not exposed via PostgREST).
  A GUC (`app.trial_identity_pepper`) overrides it if set. `billing_identity_pepper()`
  fail-closes (raises) if unconfigured.
- New registry table `billing_identities` (one row per `identity_hash`, no raw
  email, RLS enabled with no policies = locked to SECURITY DEFINER functions).
- `billing_trial_claims` gains `identity_hash` + `identity_id`, plus
  `UNIQUE(identity_hash)` and a partial `UNIQUE(organization_id)`. The legacy
  `normalized_email_hash` (sha256) column stays for back-compat and is still
  enforced. Existing claims are backfilled from `auth.users.email`.

**Reused existing infrastructure (no duplicate tables):**
- `organization_billing_states` → `billing_subscriptions` (012/027).
- `security_events` → `domain_events`; `billing.*` names auto-classify as the
  owner/admin-only `security` activity class (087/088). No raw email is written.
- `can_manage_billing` already existed (002, owner-only) and is reused.

## Entitlement RPCs (SECURITY DEFINER, explicit `search_path`, `authenticated` only)

| RPC | Purpose |
|---|---|
| `get_trial_eligibility_for_current_user()` | Typed eligibility for the current user (auth.uid only). |
| `claim_trial_for_current_user(org)` | Explicit atomic claim: re-checks membership + `can_manage_billing` (owner), confirmed email, developer-unlimited and billing state; race-safe via the unique constraints. |
| `get_organization_access_state(org)` | Typed access state derived from `billing_subscriptions` + developer unlimited. |
| `can_write_org(org)` | `can_write_data` (002) ∧ `is_organization_writable` (027); developer-unlimited always writes. |

Reason codes: `auth_required`, `verified_email_required`, `organization_required`,
`membership_required`, `permission_denied`, `trial_claimed`, `trial_already_used`,
`trial_not_available`, `billing_state_invalid`, `developer_unlimited`,
`never_used`, `internal_error`.

Access states: `no_org`, `trialing`, `trial_expired`, `paid_active`,
`payment_past_due`, `payment_grace`, `payment_unpaid`, `canceled`, `suspended`,
`security_hold`, `developer_unlimited`, `requires_paid_plan`.

`init_trial_subscription` (called by `create_organization`) was redefined to also
write the HMAC identity — same return values, non-breaking. The legacy
`check_trial_eligibility` / `getTrialEligibility` path is left intact.

## App layer

- Types + pure parsers: `modules/billing/types/entitlement.types.ts`,
  `modules/billing/services/entitlement.ts` (fail-closed; 44 unit tests).
- Queries/services: `get-organization-access-state.ts`,
  `get-trial-eligibility-v2.ts`, `claim-trial.ts` (RLS-scoped authenticated
  client — no service role). Exported from `modules/billing/index.ts`.

## Verification

- DB harness: `supabase/tests/trial_identity_verification.sql` — positive,
  negative and race scenarios. Run against a local DB after `supabase db reset`.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` all pass.

## Rollback / rotation

See the header of `supabase/migrations/089_trial_identity_hardening.sql` for the
full DROP sequence and the pepper-rotation procedure (rotating the pepper
invalidates HMAC identities; the sha256 back-compat column still catches reuse
by email, then recompute `identity_hash` from `auth.users`).

## Status

Migration 089 is **applied to remote** (confirmed 2026-07-06). The entitlement
RPCs are live, so the onboarding/billing eligibility queries now return real
data. Migration 088 (business-activity owner scope) is also applied. Next free
migration number = **090**.

> **Operational note:** applying 089 auto-generated the HMAC pepper into
> `private.app_secrets`. Do not delete or regenerate that row in production —
> doing so invalidates every stored `identity_hash`. Follow the rotation
> procedure in the migration header if a rotation is ever required.
