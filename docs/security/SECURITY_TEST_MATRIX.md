# Security Control Plane Test Matrix

This matrix tracks the automated and manual coverage for auth, tenant context,
permissions, billing/trial entitlements, invite rules, RLS, provider webhooks,
and common bypass/race scenarios.

## Automated Matrix

| Scenario | Expected result | Automated/manual | Test file | Status |
|---|---|---:|---|---|
| Unauthenticated trial eligibility | Returns `auth_required`; no trial claim | SQL harness | `supabase/tests/trial_identity_verification.sql` | Covered |
| Unauthenticated protected mutation | Guard/route denies before mutation | Vitest + manual | `lib/security/require-app-access.test.ts`, manual checklist | Covered |
| Authenticated user without active org | `requireOrg`/guard blocks mutation | Vitest + manual | `lib/security/require-app-access.test.ts`, manual checklist | Covered |
| Forged `organization_id` | `INVALID_TENANT_CONTEXT`; no write | Vitest | `lib/security/require-app-access.test.ts` | Covered |
| Forged `workspace_id` | `INVALID_TENANT_CONTEXT`; no write | Vitest | `lib/security/require-app-access.test.ts` | Covered |
| `requireUser` / `requireOrg` compatibility | Existing auth flow still resolves active context | Vitest | `lib/auth/resolve-active-organization.test.ts`, `lib/security/require-app-access.test.ts` | Covered |
| Owner/admin permission path | Allowed when permission exists | Vitest | `lib/security/require-app-access.test.ts` | Covered |
| Member without invite permission | `PERMISSION_DENIED` | Vitest | `lib/security/require-app-access.test.ts`, `modules/members/services/invite-protection.test.ts` | Covered |
| Member without money write permission | `PERMISSION_DENIED` through `data.write` gate | Vitest | `lib/security/require-app-access.test.ts` | Covered |
| Member without billing manage | Checkout/change-plan denied; provider not called | Vitest | `lib/security/server-action-bypass.test.ts` | Covered |
| Role escalation in invites | Owner/billing/elevated invalid roles rejected | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Fresh identity can claim trial once | Claim succeeds and creates trialing subscription | SQL harness | `supabase/tests/trial_identity_verification.sql`, `supabase/tests/trial_reuse_verification.sql` | Covered |
| Trial claimed immediately | Eligibility flips to claimed after claim | SQL harness | `supabase/tests/trial_identity_verification.sql` | Covered |
| Same identity cannot claim second trial | Second claim denied; one claim row | SQL harness | `supabase/tests/trial_identity_verification.sql`, `supabase/tests/trial_reuse_verification.sql` | Covered |
| Second organization does not grant new trial | Denied org is read-only/expired | SQL harness | `supabase/tests/trial_reuse_verification.sql` | Covered |
| Expired/canceled trial cannot be reactivated | Claim remains denied; access state is expired | SQL harness | `supabase/tests/trial_identity_verification.sql`, `supabase/tests/trial_reuse_verification.sql` | Covered |
| Email casing/spacing identity | Same HMAC identity hash | SQL harness | `supabase/tests/trial_identity_verification.sql` | Covered |
| Raw email absent from trial/security events | No raw email columns/payload text | SQL harness | `supabase/tests/trial_identity_verification.sql` | Covered |
| Trialing can write within limits | Entitlement allows write; limits enforce quota | Vitest + SQL harness | `lib/security/entitlements.test.ts`, `supabase/tests/phase6_rls_rpc_verification.sql` | Covered |
| Trial expired read/billing allowed | Read/billing allowed; write denied | Vitest + SQL harness | `lib/security/entitlements.test.ts`, `lib/security/require-app-access.test.ts`, `supabase/tests/phase6_rls_rpc_verification.sql` | Covered |
| Requires paid plan cannot write | `PLAN_REQUIRED` | Vitest | `lib/security/entitlements.test.ts` | Covered |
| Paid active can write within plan | Entitlement allows write; limits still apply | Vitest | `lib/security/entitlements.test.ts`, `lib/security/require-app-access.test.ts` | Covered |
| Past due behavior | Write allowed; invite denied | Vitest | `lib/security/entitlements.test.ts`, `modules/members/services/invite-protection.test.ts` | Covered |
| Grace behavior | Write allowed; invite denied | Vitest | `lib/security/entitlements.test.ts`, `modules/members/services/invite-protection.test.ts` | Covered |
| Unpaid behavior | Write denied with payment required | Vitest | `lib/security/entitlements.test.ts` | Covered |
| Suspended/security hold | Writes denied with typed errors | Vitest | `lib/security/entitlements.test.ts` | Covered |
| Developer unlimited | All intents allowed; provider cannot grant it | Vitest + SQL harness | `lib/security/entitlements.test.ts`, `modules/billing/services/billing-webhook.test.ts`, `supabase/tests/security_control_plane_verification.sql` | Covered |
| Trialing org invite within limit | Allowed | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Expired/restricted org invite | Denied with friendly reason | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Member limit reached | Invite send/accept denied | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Invalid/expired/used invite | RPC reason maps to safe recipient error | Vitest + manual | `modules/members/services/invite-protection.test.ts`, manual checklist | Covered |
| Invite acceptance re-checks state | Backend RPC denial is surfaced | Vitest | `lib/security/server-action-bypass.test.ts` | Covered |
| Trial-used user accepts into paid active as member | Allowed | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Trial-used user accepts into trial/restricted org | Denied | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Trial-used user accepts elevated/billing role | Denied | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Direct create task bypass after trial expiry | Denied before DB/client writes | Vitest | `lib/security/server-action-bypass.test.ts` | Covered |
| Direct create document bypass after trial expiry | Denied before DB/client writes | Vitest | `lib/security/server-action-bypass.test.ts` | Covered |
| Direct upload document bypass after trial expiry | Route uses same guard; manual endpoint check | Manual + code inspection | `app/api/documents/upload/route.ts`, manual checklist | Manual |
| Direct create transaction bypass after trial expiry | Denied before usage reservation/DB | Vitest | `lib/security/server-action-bypass.test.ts` | Covered |
| Direct execute action-center item after trial expiry | Denied before loading item | Vitest | `lib/security/server-action-bypass.test.ts` | Covered |
| Direct forged org mutation | Guard rejects mismatched org/workspace | Vitest | `lib/security/require-app-access.test.ts` | Covered |
| Cross-tenant select | RLS policies deny rows | SQL harness | `supabase/tests/data_isolation_visibility_verification.sql`, `supabase/tests/phase6_rls_rpc_verification.sql` | Covered |
| Cross-tenant insert/update | RLS/RPC helpers deny writes | SQL harness | `supabase/tests/data_isolation_visibility_verification.sql`, `supabase/tests/phase6_rls_rpc_verification.sql` | Covered |
| Expired org direct DB write | `is_organization_writable` false; writes blocked where policy uses helper | SQL harness | `supabase/tests/phase6_rls_rpc_verification.sql` | Covered |
| Direct Supabase usage reserve cross-tenant | RPC rejects guessed/cross-tenant org | SQL harness | `supabase/tests/phase6_rls_rpc_verification.sql` | Covered |
| RLS helper performance | Existing helper/index checks; no perf regression benchmark in Vitest | Manual/SQL | `supabase/tests/phase6_rls_rpc_verification.sql`, manual checklist | Partial |
| Concurrent trial claims | Unique identity/org constraints collapse duplicates | SQL harness | `supabase/tests/trial_identity_verification.sql`, `supabase/tests/trial_reuse_verification.sql` | Covered |
| Concurrent org creations for same identity | Second init path denied | SQL harness | `supabase/tests/trial_identity_verification.sql`, `supabase/tests/trial_reuse_verification.sql` | Covered |
| Concurrent invite accepts for last seat | One reserved acceptance, next denied | Vitest | `modules/members/services/invite-protection.test.ts` | Covered |
| Trial expires while form open | Backend guard denies mutation | Vitest + SQL harness | `lib/security/server-action-bypass.test.ts`, `supabase/tests/phase6_rls_rpc_verification.sql` | Covered |
| Duplicate provider webhook | Accepted as duplicate; no second state transition | Vitest + SQL harness | `modules/billing/services/billing-webhook.test.ts`, `supabase/tests/security_control_plane_verification.sql` | Covered |
| Out-of-order provider webhook | Event accepted but ignored; newer state remains | Vitest + SQL harness | `modules/billing/services/billing-webhook.test.ts`, `supabase/tests/security_control_plane_verification.sql` | Covered |
| Invalid provider webhook signature | Rejected | Vitest | `modules/billing/services/billing-webhook.test.ts` | Covered |
| Provider event raw email redaction | Audit payload is sanitized/redacted | Vitest + SQL harness | `modules/billing/services/billing-webhook.test.ts`, `supabase/tests/security_control_plane_verification.sql` | Covered |
| Expired trial banner | Banner appears with required microcopy | Vitest + manual | `modules/billing/services/access-state-ui.test.ts`, manual checklist | Covered |
| Disabled buttons explain why | Tooltip/microcopy generated by shared access UI | Vitest + manual | `modules/billing/services/access-state-ui.test.ts`, manual checklist | Covered |
| Billing CTA available | Billing intent allowed in restricted states | Vitest + manual | `lib/security/entitlements.test.ts`, manual checklist | Covered |
| Paid plans after trial used | Trial CTA hidden by eligibility helper | Vitest + manual | `modules/billing/services/entitlement.test.ts`, manual checklist | Covered |
| Developer account warnings | Developer access does not show false restriction | Vitest + manual | `modules/billing/components/developer-access-badge.test.tsx`, manual checklist | Covered |

## Manual QA Checklist

Use a local/staging database. Do not run destructive fixture operations against production.

### Register, Login, Onboarding

- Register a fresh user with confirmed email.
- Complete onboarding and create the first organization.
- Confirm the organization lands in `trialing`.
- Confirm the dashboard loads read paths without errors.
- Log out and verify protected dashboard mutations redirect or deny.

### Trial Expiry Fixture

- In local/staging DB, set the active org subscription to expired:

```sql
UPDATE public.billing_subscriptions
SET status = 'expired',
    trial_ends_at = now() - interval '1 day',
    current_period_end = now() - interval '1 day'
WHERE organization_id = '<org-id>';
```

- Refresh the dashboard.
- Confirm the trial expired banner appears:
  `Пробный период завершён. Данные сохранены, но новые действия временно недоступны. Выберите платный план, чтобы продолжить.`
- Confirm read-only data still loads where product policy allows.

### Core Write Attempts

- Try creating a task.
- Try updating task status/due date.
- Try creating a project.
- Try creating a money account.
- Try creating a money transaction.
- Try uploading a document.
- Try creating/updating/renewing a subscription.
- Try executing an Action Center item.
- Expected: UI disables or explains the restriction, and any direct form/API attempt is denied by backend.

### Invite Send / Accept

- From a `trialing` org with seats available, invite a member.
- Fill the member limit and try another invite.
- Expire the org and try sending an invite again.
- Try accepting an invalid, expired, and already-used invite token.
- Try accepting a valid invite after the sender org has become restricted.
- Try accepting as a user who already consumed a trial:
  - into `trialing`/restricted org: denied;
  - into `paid_active` as `member`: allowed if policy permits;
  - into `admin`/owner-like role: denied.

### Billing Page

- Open Settings > Billing from every blocked state.
- Confirm paid plans remain visible after trial use.
- Confirm there is no misleading “Start free trial” CTA after trial was used.
- Click paid plan CTA:
  - if no provider configured: honest provider-not-connected message;
  - if provider configured later: redirect to provider checkout.
- Confirm dashboard actions never directly set `billing_subscriptions.status = 'active'`.

### Direct Action/API Attempts

- With the org expired, POST directly to document upload endpoint.
- Invoke forms with disabled buttons re-enabled in devtools.
- Submit forged `organization_id` or `workspace_id` where forms expose hidden IDs.
- Expected: backend returns typed denial; no rows are inserted/updated.

### SQL Harnesses

Run against local/staging after migrations:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trial_identity_verification.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/trial_reuse_verification.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/data_isolation_visibility_verification.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase6_rls_rpc_verification.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_control_plane_verification.sql
```

### UI States

- Verify expired trial banner on desktop and mobile.
- Verify disabled buttons have tooltip or nearby accessible explanation.
- Verify Billing CTA is reachable from blocked states.
- Verify paid plans are visible after trial was used.
- Verify developer-unlimited account does not show false plan warnings.
- Verify mobile layout still allows Billing navigation and plan selection.

## Notes

- RLS tests are SQL harnesses, not Vitest, because they must execute with
  database roles and `request.jwt.claim.sub` context.
- Upload API bypass coverage is manually verified plus guarded by shared
  `requireAppAccess`; direct unit coverage can be added later if a route-handler
  test harness is introduced.
- Provider-specific checkout signatures are not covered because no provider has
  been selected. The provider-agnostic boundary and webhook idempotency are covered.
