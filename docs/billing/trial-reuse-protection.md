# Trial Reuse Protection (migration 086)

## Rule

The 14-day trial is granted **once per billing owner identity**, not per
organization:

- identity = `user_id` + `normalized_email_hash` (+ nullable
  `billing_customer_id` reserved for a future payment provider);
- the trial is considered **claimed the moment it starts**
  (`trial_started_at exists = trial already claimed`);
- deleting the organization does not restore eligibility (the claim survives
  with `organization_id = NULL`);
- being invited into someone else's organization never burns a personal trial —
  claims are created only when provisioning one's **own** organization.

## Where things live

| Concern | Location |
| --- | --- |
| Trial right (claim ledger) | `public.billing_trial_claims` — unique on `user_id`, `normalized_email_hash`, partial-unique `billing_customer_id`; RLS read-only (own row / org admin), no client write policies |
| Current org plan | `billing_subscriptions` + `plans` (unchanged, 024/027) |
| Atomic guard | DB unique constraints + `init_trial_subscription(org, owner)` (SECURITY DEFINER, internal-only, called from `create_organization`) — parallel activations cannot create two claims |
| Eligibility contract | RPC `check_trial_eligibility()` → `{eligible, reason}` with reasons `never_used / trial_active / trial_consumed / trial_blocked / billing_identity_already_used`; app wrapper `modules/billing/queries/get-trial-eligibility.ts` |
| Consumption | `consume_expired_trials()` via `/api/cron/trial-sweep` (daily, `CRON_SECRET`); lazily also in `refresh_trial_status()` on render |
| Events / audit | `billing.trial.claimed / denied / consumed`, `billing.plan.required` written to `domain_events` + `audit_logs` **inside the same DB transaction** as the claim |
| UI | `TrialBanner` (`denied` kind), Billing settings notice, onboarding notice. UI is not a security boundary — the DB denies repeat trials regardless |

## Denied path

A repeat organization is still created, but its subscription starts as
`status='expired'`, `trial_ends_at=now()`, `metadata.trial_denied=true`.
The existing 027 enforcement (`is_organization_writable`) makes it read-only
immediately; the only way forward is a paid plan (Start / Pro / Business —
activated by support until a payment provider exists).

`changePlanAction` refuses `planSlug='trial'` — previously it could set the
trial plan back to `status='active'`, resurrecting an expired trial.

## Email privacy

Raw email is never stored in billing tables/events/logs — only
`sha256(lower(trim(email)))` via `public.normalized_email_hash()`.
Known limitation: the hash is unsalted (no server-side secret is available
inside Postgres). Moving to a keyed hash later requires recomputing one column.

## Deploy order

Apply migration 086 **before or together with** this code. The app degrades
safely either way (eligibility RPC errors are treated as UX-only), but the
one-trial guarantee starts only once 086 is applied. The migration backfills
claims for existing trial organizations, so existing users cannot farm trials
either.

## Manual verification

`supabase/tests/trial_reuse_verification.sql` (local/staging only, rolls back)
covers: first trial granted; second org denied + read-only; duplicate claims
rejected by unique constraints (race); invited member keeps personal
eligibility; expiration consumes the claim; org deletion does not restore
eligibility.
