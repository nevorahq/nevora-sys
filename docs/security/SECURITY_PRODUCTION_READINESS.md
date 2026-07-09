# Security Production Readiness Review

Date: 2026-07-07  
Scope: Security Control Plane for private beta: auth, organization context, permissions, trial/billing entitlements, invites, RLS, provider boundary, restricted-state UX, observability, tests.

## Verdict

Ready with fixes.

The Security Control Plane is substantially ready for a private beta of the active modules, provided the high-priority release gates below are completed before inviting external users. The main control layers are in place: centralized mutation authorization, typed access states, one-trial-per-identity constraints, invite protections, provider-only paid activation, friendly restricted-state UX, and a broad Vitest/SQL/manual test matrix.

The system is not yet “unconditionally ready” because the SQL/RLS harnesses and manual QA checklist still need to be executed against the target local/staging database, and one billing mutation path still updates subscription state directly from the dashboard.

## Executive Summary

The private beta posture is good for the core active modules: Tasks, Money, Documents, Subscriptions, Settings, Members, Action Center, AI, and the dashboard shell now consistently route critical mutations through `requireAppAccess` or equivalent server-side checks. UI gating is treated as UX only; backend/RLS remain the real boundary.

Trial reuse protection is strong: HMAC billing identities, one claim per identity, one claim per organization, no raw email in billing identity tables, and typed trial eligibility/access-state RPCs. Invite flow now re-checks sender state, recipient eligibility, member limits, and role restrictions in authoritative RPCs.

Billing paid activation has the right private-beta shape when no provider is selected: provider-agnostic checkout/portal placeholders and a verified/idempotent webhook boundary. Dashboard plan changes no longer activate paid plans. However, `cancelSubscriptionAction` still directly mutates `billing_subscriptions`, which conflicts with the provider-boundary rule once provider-managed billing is enabled.

The largest remaining uncertainty is verification, not architecture: the SQL/RLS harnesses were added/documented but still need to be run against the actual target database after all migrations. Manual QA is also required for UI/mobile/accessibility and direct API attempts.

## Critical Issues

| Issue | Risk | Required Fix | Owner |
|---|---|---|---|
| None currently identified in reviewed active-module control plane. | No known P0 that would allow paid activation fakery, cross-tenant writes, or repeat trial claims in the implemented paths. | Keep private beta blocked if any SQL/RLS harness fails. | Engineering |

## High Issues

| Issue | Risk | Required Fix | Owner |
|---|---|---|---|
| SQL/RLS harnesses not yet executed against target DB. | A migration/RLS/grant mismatch could exist despite Vitest passing. This is the highest uncertainty before private beta. | Run all SQL harnesses in `docs/security/SECURITY_TEST_MATRIX.md` against local/staging after migration reset/apply. Treat failures as release blockers. | Engineering |
| `modules/billing/actions/cancel-subscription.action.ts` directly updates `billing_subscriptions`. | Once a provider is selected, dashboard-driven cancellation can desync provider truth and violates “dashboard can only start checkout/portal flows.” It does not fake paid activation, but it is still a billing-state mutation outside webhook/provider/admin migration boundary. | Convert cancel/manage subscription to billing portal/provider flow, or explicitly mark it disabled until provider integration exists. Keep only trusted webhook/admin migration paths for provider-managed billing state. | Engineering |
| Manual QA checklist not completed on staging/mobile. | UI gates, disabled explanations, billing CTAs, and direct-form bypass attempts may regress outside unit tests. | Complete `SECURITY_TEST_MATRIX.md` manual checklist on staging, including expired trial fixture, direct API attempts, invite accept/send, mobile Billing page. | QA / Engineering |
| Secondary routes for CRM/Booking remain reachable and many mutations still use `requireOrg` rather than `requireAppAccess`. | Project context marks CRM/Booking as paused/secondary, but routes still exist. If exposed to beta users, restricted orgs may mutate secondary data without the new entitlement gate. | For private beta either hide/disable paused modules at navigation/route level, or apply `requireAppAccess` to their user-triggered mutations before exposure. | Product / Engineering |

## Medium Issues

| Issue | Risk | Suggested Fix |
|---|---|---|
| `092_billing_provider_boundary.sql` is not wrapped in an explicit `BEGIN`/`COMMIT`. | Supabase migration behavior may be transactional depending on runner, but explicit transaction boundaries make partial-apply risk clearer. | Wrap future complex DB hardening migrations in explicit transactions where supported. For 092, validate dry-run/reset before release. |
| Provider webhook signature is not yet using the final Paddle verifier. | Correct during private beta, but not production-grade for live paid traffic. | Complete native Paddle signature verification and event parsing before enabling paid mode. |
| Upload route bypass is covered by shared guard and manual matrix, not a dedicated route-handler unit test. | Lower confidence that route returns the expected status/body under every denied state. | Add route-handler test harness for `app/api/documents/upload/route.ts` if the project standardizes API route testing. |
| RLS helper performance is asserted structurally, not benchmarked. | Large orgs could expose slow helper queries in list-heavy views. | Run `EXPLAIN ANALYZE` on `is_organization_writable`, `get_organization_access_state`, invite checks, usage reservation, and cross-tenant selects with realistic fixtures. |
| Automation foundation can create entity links from domain events, but future automation executors need another review. | Current handlers are limited, but future automation rules could create money/tasks without fresh entitlement checks. | Before enabling user-configurable automation execution, require `requireAppAccess({ intent: "execute" })` or equivalent policy context per side-effecting handler. |

## Low Issues

| Issue | Suggested Fix |
|---|---|
| Documentation still contains older audit text that mentions now-fixed PII/hash issues. | Keep older audit docs as historical, but add “superseded by SECURITY_PRODUCTION_READINESS.md” note if they confuse reviewers. |
| Some security event telemetry is console-based, not a dedicated `security_events` table. | Accept for private beta; consider structured DB/security-event sink before public launch if audit retention/compliance matters. |
| Migration reversibility is documented in comments for major trial changes but not consistently provided as down migrations. | Accept for Supabase-style forward migrations; maintain rollback playbooks for release candidates. |

## Database Review

Migrations are sequential through `092_billing_provider_boundary.sql`; there is a numbering gap at `054`, but the current ordered set is otherwise coherent and already includes trial, invite, usage, RLS, and provider-boundary migrations.

One-trial-per-identity is protected by HMAC-based `identity_hash` in `billing_trial_claims` and `billing_identities`, with a unique constraint on `billing_trial_claims.identity_hash`. One-trial-per-organization is protected by the partial unique index on `billing_trial_claims.organization_id`.

The trial identity design is production-appropriate for private beta:

- Raw email is not stored in `billing_trial_claims` or `billing_identities`.
- `billing_identity_hash(email)` uses HMAC-SHA256 with a DB-held pepper in `private.app_secrets`.
- Existing `normalized_email_hash` remains for compatibility, but enforcement moves to HMAC identity.
- Claim functions derive user/email/org server-side.

Provider-boundary tables are present:

- `billing_provider_mappings`
- `billing_provider_events`
- unique `(provider, provider_event_id)` for dedupe
- unique provider customer/subscription indexes
- RLS-enabled, client read-only for admins, no client writes

Backfill safety looks acceptable: migrations use `IF NOT EXISTS`, catalog guards, and compatibility columns. The main dry-run requirement is still open: run migrations on a reset local/staging DB and on a copy-like staging DB with pre-existing organizations.

Organization billing state is explicit through `billing_subscriptions.status` plus typed metadata (`payment_state`, `security_hold`, provider event metadata). The app consumes normalized `OrgAccessState` via `get_organization_access_state`, so frontend does not reimplement billing rules.

No destructive migration risks were found in the reviewed security-control migrations, but migration 092 should be dry-run because it drops/re-adds a status check constraint and adds provider columns/tables.

## RLS Review

The design uses RLS and SECURITY DEFINER RPCs in the expected places:

- Tenant tables rely on org membership policies.
- Trial/identity/provider tables deny direct writes from `anon`/`authenticated`.
- Provider event application is a service-role-only RPC with explicit `search_path`.
- Invite RPCs re-check org state, recipient trial history, role, and seats.
- Usage reservation RPCs enforce writable org and plan limits.

`WITH CHECK`/write restrictions are implemented through a mix of table policies, helper functions, and RPC boundaries. The high-risk active mutations also call app-layer `requireAppAccess`, so direct Supabase bypass still needs RLS/RPC verification rather than trusting app code.

Security definer functions reviewed in the recent migrations set `search_path` explicitly. Grants are generally least-privilege: sensitive functions/tables revoke public/app-role execution or writes, with service role reserved for webhook/cron/background boundaries.

Open release gate: SQL harnesses must be executed:

- `supabase/tests/trial_identity_verification.sql`
- `supabase/tests/trial_reuse_verification.sql`
- `supabase/tests/data_isolation_visibility_verification.sql`
- `supabase/tests/phase6_rls_rpc_verification.sql`
- `supabase/tests/security_control_plane_verification.sql`

## Auth Review

Login/register/onboarding should remain compatible with the new control plane because auth context still flows through `requireUser` and `requireOrg`. Expired trial users can still authenticate and read/billing access remains allowed by entitlement matrix.

Expired users are blocked from restricted mutations via `requireAppAccess` and DB/RPC helpers. The onboarding trial claim path derives eligibility server-side, using confirmed email and billing identity. Unconfirmed email gets a typed denial.

No new account enumeration issue was found in the core security plane. Invite by email still returns user-not-found style field errors in admin/member invite surfaces; this is acceptable for authenticated org admins in private beta but should be revisited before public/self-serve scale if stricter anti-enumeration is required.

Captcha/rate-limit hooks are outside this review except existing public booking/API rate-limit notes. No regression was observed.

## Authorization Review

`requireAppAccess` is the central mutation funnel for active modules. It composes:

- server-resolved user/org/workspace context
- tenant mismatch checks for supplied org/workspace IDs
- role/permission check
- typed access-state entitlement matrix
- optional plan capability/limit check

Critical active module writes in Tasks, Money, Documents, Subscriptions, Settings/Members, Action Center, and AI are now guarded. Billing manage paths require `billing.manage` and route paid plan selection into checkout provider boundary rather than direct activation.

Typed errors are consistent enough for private beta: `TRIAL_EXPIRED`, `PLAN_REQUIRED`, `PAYMENT_REQUIRED`, `PAYMENT_PAST_DUE`, `ORGANIZATION_SUSPENDED`, `SECURITY_HOLD`, `INVALID_TENANT_CONTEXT`, `PERMISSION_DENIED`, and `LIMIT_REACHED`.

Known authorization caveat: paused/secondary CRM/Booking routes still include mutation paths using `requireOrg` only. If those modules are visible in private beta, they need gates or feature disablement.

## Billing / Trial Review

Trial behavior is strong:

- fresh eligible identity can claim once
- claim is immediate
- same identity cannot claim a second trial
- second organization does not reset trial
- expired/consumed trial cannot be reactivated
- email casing/spacing canonicalizes to same HMAC identity
- raw email is absent from billing identity/claim tables

Paid activation cannot be faked by the dashboard:

- `changePlanAction` no longer writes `status = 'active'`
- checkout path returns provider placeholder unless provider configured
- webhook route verifies provider-agnostic signature
- webhook calls isolated service-role RPC
- events are deduped by provider event id
- older provider events are ignored
- `developer_unlimited` cannot be granted by webhook

Developer unlimited remains app-side/profile-driven and is excluded from provider webhook status transitions.

High issue: dashboard cancellation still mutates subscription state directly. This should be converted to provider portal/provider action before provider-managed billing is enabled.

## Invite Review

Invite protections are appropriate for private beta:

- sender must be admin/owner via app and RPC checks
- sender org must be trialing, paid active, or developer unlimited
- restricted/expired orgs cannot invite
- role is normalized to `member` or `admin`; owner/billing-like roles are blocked
- member limit is enforced
- recipient trial-used state is checked on accept/send
- trial-used recipient can join paid active as member if policy allows
- trial-used recipient cannot join trial/restricted org or elevated role
- invalid/expired/used invite reasons map to safe user messages

No raw recipient email is written to audit/domain events in app invite actions; masked email is used where support triage needs it. The SQL invite decision audit uses IDs/reasons only.

## UI/UX Review

Restricted states are understandable and friendly:

- expired trial banner uses required Russian microcopy
- shared access-state UX components provide alerts/tooltips/CTA patterns
- disabled actions explain restrictions
- Billing remains reachable from blocked states
- paid plans remain visible after trial use
- trial CTA is hidden after trial already used
- developer-unlimited does not show false warnings

The app avoids treating UI as enforcement: backend and DB remain source of truth.

Manual QA still must verify mobile behavior, accessible tooltip/label behavior, loading/error states, and direct form submission with disabled controls re-enabled.

## Backend Review

Active critical mutations are guarded:

- task create/update/delete/status/due-date
- project create/update/archive/assign
- money account/transaction/transfer/planned transaction/document extraction confirmations
- document create/update/delete/upload/extract/publish/attachment
- subscription create/update/delete/renew/payment mark
- member invite/role/remove
- action-center execute/resolve/dismiss/snooze/bulk dismiss
- AI generate/dismiss/write-like actions
- billing checkout/portal

File uploads are guarded by `requireAppAccess` before parsing and storage writes. Background extraction in upload re-checks access in the deferred path.

No service role misuse was found in normal user-triggered billing/application logic. Service role appears limited to cron/background/provider webhook/integration-style boundaries, including trial sweep, provider webhook, notification delivery, extraction worker, and stale suggestion sweeps.

Backend concern: direct billing cancellation should not mutate provider-managed billing state from dashboard.

## Observability Review

Security denials are logged via `auditSecurityEvent` with masked actor identity and typed denial codes. Invite denials are auditable without raw email. Billing provider events are stored in `billing_provider_events` with dedupe, ignored reason, org/provider IDs, and redacted payload guard.

Logs avoid obvious raw secrets/payment data in the reviewed security paths. The review found historical docs with older raw-email concerns, but current invite/CRM sinks use `maskEmail` and provider event payloads are sanitized/redacted.

Webhook failures are visible through structured logger events in the webhook route. If a real provider is later selected, provider-specific error fields should be normalized and redacted before logging.

## Performance Review

The security model is not obviously over-fetching:

- Dashboard layout loads access state once and provides UI context.
- Server actions check access per mutation, which is expected.
- UI does not duplicate business logic beyond display gating.
- Provider checks are not hot-path until checkout/webhook.

Indexes exist for key trial/provider/usage helper paths:

- trial identity hash and organization claim uniqueness
- provider customer/subscription mappings
- provider event org/subscription lookups
- usage counters and plan limits in prior migrations

Open performance gate: run `EXPLAIN ANALYZE` for RLS/helper functions on staging-sized fixtures before public launch. For private beta, run the SQL harnesses and monitor slow query logs.

## Test Coverage Review

Automated coverage is broad:

- Entitlement matrix unit tests
- `requireAppAccess` authorization/tenant/permission tests
- Server Action bypass tests for task/document/money/action-center/checkout/invite
- Invite policy tests including last-seat race semantics
- Trial eligibility/result parser tests
- Billing provider webhook signature/dedupe/out-of-order tests
- Developer access UI tests
- SQL harnesses for trial identity/reuse, RLS/data isolation, provider boundary

Latest known Phase 7 verification run:

- `npm run lint` passed
- `npx next typegen` passed
- `npx tsc --noEmit` passed
- `npm test` passed: 133 passed, 1 skipped; 760 passed, 3 skipped
- `npm run build` passed after rerunning outside sandbox due Turbopack local port bind limitation

Gaps:

- SQL/RLS harnesses need real execution in local/staging.
- Manual QA checklist needs completion.
- Upload route denial is manually documented, not directly unit-tested as a route handler.
- Provider-specific checkout/webhook tests cannot exist until provider is selected.

## Regression Risks

| Area | Risk | Mitigation |
|---|---|---|
| Tasks | Disabled UI could drift from backend errors. | Shared access-state provider + direct action bypass tests. |
| Money | Transactions are high-impact and quota-backed. | `requireAppAccess`, usage reservation compensation tests, RLS harness. |
| Documents | Uploads combine DB/storage/background extraction. | Guard before storage, manual upload bypass QA, future route-handler tests. |
| Subscriptions | User-domain subscriptions are separate from SaaS billing; naming confusion risk. | Keep subtracker actions guarded as data writes; document distinction from billing subscription. |
| Settings | Billing/members access must remain reachable in blocked states. | Entitlement tests allow billing/read, invite tests deny restricted states. |
| Members | Invite flow has sender and recipient policy. | RPC + unit tests + manual accept/send checklist. |
| Action Center | Executes cross-module side effects. | `requireAppAccess` execute intent and scoped permissions. |
| AI | AI may suggest but must not write/accept without guard. | AI actions use execute/write gate and capability checks. |
| Automation | Future automation executor may introduce side effects. | Keep current foundation limited; require separate security review before enabling user-configurable side effects. |
| CRM/Booking | Paused modules still reachable if navigation/routes remain enabled. | Hide/disable for beta or apply access gates before exposure. |

## Rollback Plan

If private beta reveals a security-control regression:

1. Disable risky UI entry points through navigation/feature flags where available.
2. For billing/provider issues, unset `BILLING_PROVIDER` / webhook secret and disable checkout CTAs; keep current read/billing state display.
3. For invite issues, disable invite actions in UI and revoke/grant-block relevant invite RPC execution if necessary.
4. For trial claim issues, stop onboarding trial claim calls and pause new organization creation if repeat claims are observed.
5. For RLS issues, deploy a forward hotfix migration that revokes grants or tightens policies. Avoid destructive rollbacks.
6. For app-layer guard regressions, ship a focused patch adding `requireAppAccess` or route-level disablement.
7. Keep existing data intact; do not run destructive `DELETE`/`TRUNCATE` rollback scripts.

## Release Checklist

| Check | Status |
|---|---|
| `npm ci` | Not run in this review; run in CI/release environment. |
| `npx next typegen` | Passed in Phase 7 run; rerun before release. |
| `npx tsc --noEmit` | Passed in Phase 7 run; rerun before release. |
| `npm run lint` | Passed in Phase 7 run; rerun before release. |
| `npm test` | Passed in Phase 7 run; rerun before release. |
| `npm run build` | Passed in Phase 7 run after sandbox escalation; rerun in CI/release environment. |
| Migration dry-run/reset | Required before private beta. |
| SQL/RLS harnesses | Required before private beta. |
| Manual QA checklist | Required before private beta. |
| No P0/P1 security bugs open | No known P0; high issues above must be resolved or explicitly accepted. |
| No raw email leakage | Current security/billing/invite paths look compliant; verify with SQL harnesses. |
| No service role misuse | Current reviewed user-triggered paths look compliant; re-check before release. |
| Direct API bypass tests | Vitest coverage added and passing in Phase 7 run. |
| RLS gaps documented | Documented; SQL execution is release gate. |

## Final Recommendation

Proceed toward private beta, but do not open beta until the high issues are resolved:

1. Run SQL/RLS harnesses against the target DB.
2. Complete manual QA checklist on staging, including mobile and direct bypass attempts.
3. Remove or disable direct dashboard subscription cancellation once billing is provider-managed.
4. Hide/disable paused CRM/Booking modules for beta, or gate their mutations with `requireAppAccess`.

After those fixes/checks, the Security Control Plane is ready for private beta. Before public launch, add provider-native billing verification, route-handler tests for upload bypass, RLS helper performance benchmarks, and a final review of any newly enabled automation executor.
