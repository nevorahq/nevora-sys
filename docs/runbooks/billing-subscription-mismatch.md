# Runbook — Billing / Subscription Mismatch

**Severity:** P1. The org's real entitlement disagrees with what the app enforces.

Symptoms: a paying org is read-only; an expired trial can still write; an org is
both `trialing` and `expired`; plan limits do not match the plan.

## 0. Ground truth

The repository default is `BILLING_MODE=private_beta`: paid checkout and Paddle
Customer Portal are intentionally disabled. Paddle runtime-ready mode requires
`BILLING_MODE=paid_beta` or `BILLING_MODE=production`,
`BILLING_PROVIDER=paddle`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, and paid
Paddle Price IDs outside the repo.

Paddle is the payment/subscription lifecycle source of truth once runtime-ready.
The local plan catalog and `plan_limits` remain the product entitlement source
of truth, and `get_organization_access_state` is the single entitlement oracle
the app reads. Paid state must arrive through the verified provider webhook
path; checkout success redirects never grant access by themselves. App actions
never mutate paid subscription state directly.

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

Check the trial ledger:

```sql
SELECT * FROM public.billing_trial_claims WHERE organization_id = '<org>';
SELECT * FROM public.billing_identities  WHERE user_id = '<owner>';
```

## 2. Common causes

| Symptom | Cause | Fix |
|---|---|---|
| Paying org read-only | `status` not in the writable set | Correct `status`; re-check `is_organization_writable` |
| Expired trial can still write | `trial_ends_at` in the future, or enforcement not firing | Verify `get_organization_access_state`; do not patch the app |
| Org gets a second trial | Missing `billing_trial_claims` row | Backfill; check `claim_trial_for_current_user` |
| `trialing` **and** `expired` | Two rows, or a stale row after plan change | Keep one row; `changePlanAction` must never target `plan_slug='trial'` |
| Limits don't match plan copy | `plan_limits` disagrees with `modules/billing/plan-catalog.ts` / `public-plan-view.ts` | Fix the billing catalog + seeded limits together; never add a second pricing source |
| Paid checkout button appears in Private Beta | UI bypassed billing mode | Verify `BILLING_MODE=private_beta`, `getPublicPlanViews()`, and `BillingOverview.billingMode` |
| Paddle event delivered but local state unchanged | invalid signature, missing mapping, duplicate, out-of-order event, or missing Price ID/plan slug | Inspect `billing_provider_events.ignored_reason`, then repair mapping or replay event |
| `[syncActionItems] insert failed RLS` | Expired-trial write lock, not an isolation bug | Expected. Restore entitlement or ignore. |

## 3. Reconcile

1. Decide the intended state from the org's history.
2. Correct `billing_subscriptions` with a single explicit `UPDATE`, inside a transaction, one org at a time.
3. Re-run the oracle. The app must agree without a deploy.
4. Emit an audit record explaining the manual correction.

Never mass-update `billing_subscriptions`. Never "fix" entitlement by editing
`plan_limits` for one org.

## 4. Verify

- [ ] `get_organization_access_state('<org>')` returns the intended state.
- [ ] The org can (or cannot) write, as intended.
- [ ] Billing mode matches release posture: Private Beta or Paddle runtime-ready.
- [ ] If runtime-ready, latest provider event exists in `billing_provider_events` and was processed once.
- [ ] Trial reuse still blocked: a new org by the same identity gets no trial.
- [ ] Trial reuse and trial identity verification tests pass.

## Related

- `docs/billing/usage-model.md`
- `docs/billing/trial-reuse-protection.md`
- `docs/billing/trial-identity-hardening.md`
