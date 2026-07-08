# Runbook — Billing / Subscription Mismatch

**Severity:** P1. The org's real entitlement disagrees with what the app enforces.

Symptoms: a paying org is read-only; an expired trial can still write; an org is
both `trialing` and `expired`; plan limits do not match the plan.

## 0. Ground truth

Stripe can be connected through `BILLING_PROVIDER=stripe`. Billing remains an
internal trial/plan model where `billing_subscriptions` + `plan_limits` are the
source of truth, and `get_organization_access_state` (089) is the single
entitlement oracle the app reads. Paid state must arrive through the verified
`/api/billing/webhook` path; checkout success redirects never grant access by
themselves. `cancelSubscriptionAction` never mutates `billing_subscriptions`
directly — it opens the provider portal or returns
`BILLING_PROVIDER_NOT_CONNECTED`.

So a mismatch is usually **state drift in `billing_subscriptions`** or a
provider webhook/mapping issue.

## 1. Diagnose

Read the org's actual state:

```sql
SELECT organization_id, plan_slug, status, trial_ends_at, current_period_end, metadata
FROM public.billing_subscriptions
WHERE organization_id = '<org>';
```

Then ask the oracle the app actually uses:

```sql
SELECT * FROM public.get_organization_access_state('<org>');
SELECT public.can_write_org('<org>');
```

If the table looks right but the oracle disagrees, the bug is in the RPC or in
`lib/security` — not in the data.

Check the trial ledger (086 / 089):

```sql
SELECT * FROM public.billing_trial_claims WHERE organization_id = '<org>';
SELECT * FROM public.billing_identities  WHERE user_id = '<owner>';
```

## 2. Common causes

| Symptom | Cause | Fix |
|---|---|---|
| Paying org read-only | `status` not in the writable set | Correct `status`; re-check `is_organization_writable` |
| Expired trial can still write | `trial_ends_at` in the future, or 027 enforcement not firing | Verify `get_organization_access_state`; do not patch the app |
| Org gets a second trial | Missing `billing_trial_claims` row | 086 backfill; check `claim_trial_for_current_user` |
| `trialing` **and** `expired` | Two rows, or a stale row after plan change | Keep one row; `changePlanAction` must never target `plan_slug='trial'` |
| Limits don't match plan copy | `plan_limits` disagrees with landing copy | Fix `plan_limits`; the landing page must not promise ungated features |
| `[syncActionItems] insert failed RLS` | Expired-trial **write lock**, not an isolation bug | Expected. Restore entitlement or ignore. |

## 3. Reconcile

1. Decide the *intended* state from the org's history (audit log + `domain_events`).
2. Correct `billing_subscriptions` with a single explicit `UPDATE`, inside a
   transaction, one org at a time.
3. Re-run the oracle. The app must agree without a deploy.
4. Emit an audit record explaining the manual correction.

**Never** mass-update `billing_subscriptions`. Never "fix" entitlement by editing
`plan_limits` for one org.

## 4. Verify

- [ ] `get_organization_access_state('<org>')` returns the intended state.
- [ ] The org can (or cannot) write, as intended.
- [ ] Trial reuse still blocked: a new org by the same identity gets no trial.
- [ ] `supabase/tests/trial_reuse_verification.sql` and
      `trial_identity_verification.sql` pass.

## Related

- `docs/billing/usage-model.md`
- `docs/billing/trial-reuse-protection.md`
- `docs/billing/trial-identity-hardening.md`
