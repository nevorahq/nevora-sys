# Phase 2 — Backend Security Policy Engine

Centralized authorization + entitlement gate for user-triggered mutations.

## What was built

`lib/security/` — a single funnel every guarded mutation runs through:

```
auth → org/workspace context → tenant match → membership → permission →
billing entitlement (intent × access-state) → plan capability → mutation → audit
```

| File | Responsibility |
| --- | --- |
| `require-app-access.ts` | `requireAppAccess()` — the gate. Composes `requireOrg()` (auth + membership + org/workspace + role + permissions), `get_organization_access_state` (089) and `checkPlanLimit`. Returns `AppAccessContext` (= `CurrentContext` + `accessState`). |
| `entitlements.ts` | Pure intent × access-state matrix. Fail-closed. Fully unit-tested. |
| `permissions.ts` | Well-known permission catalogue + `hasPermission`. (Role→permission mapping still lives in `require-org.ts`.) |
| `access-errors.ts` | `AccessError` + typed `AccessErrorCode` union + PII-free default messages. |
| `audit-security-event.ts` | Masked, never-throwing security-log sink (no dedicated `security_events` table — 089 folds it into `domain_events`). |
| `to-action-result.ts` | `accessErrorToActionResult` / `toActionResult` — map a thrown `AccessError` to the standard `ActionResult`. |

The **database remains the authoritative boundary** (RLS + `can_write_org` + `is_organization_writable`). The gate is defense-in-depth plus *typed* refusals so the UI can tell "no permission" from "trial expired" from "past due".

### Typed error codes
`AUTH_REQUIRED · ORG_REQUIRED · WORKSPACE_REQUIRED · MEMBERSHIP_REQUIRED · PERMISSION_DENIED · BILLING_REQUIRED · TRIAL_EXPIRED · PLAN_REQUIRED · LIMIT_REACHED · PAYMENT_REQUIRED · PAYMENT_PAST_DUE · ORGANIZATION_SUSPENDED · SECURITY_HOLD · INVALID_TENANT_CONTEXT`

### Entitlement matrix (intent × access-state)

| state | read | write | invite | execute | admin | billing |
| --- | --- | --- | --- | --- | --- | --- |
| trialing / paid_active / developer_unlimited | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| payment_past_due / payment_grace | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| trial_expired / requires_paid_plan / canceled | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| payment_unpaid | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ |
| suspended / security_hold | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| no_org | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

`admin` (settings/member-management) and `billing` stay reachable in every non-suspended degraded state so a blocked org can always resolve its own billing.

## Rollout status

**Scope for this pass: core library + critical write paths** (money, tasks, documents, subscriptions, members, billing, action-center execute).

### Integrated (43 actions)

- **moneyflow**: create/update/delete transaction, create-transfer, post-planned, create/update/deactivate account, confirm/reject document transaction
- **tasks**: create/update/delete task, change-status, update-due-date, assign/unassign; projects create/update/archive, assign-task-to-project
- **documents**: create/update/delete, add-attachment, extract (AI → `execute`), publish
- **subtracker**: create/update/delete/renew/cancel, mark-payment
- **members**: invite (+ settings invite), remove
- **billing**: change-plan, cancel-subscription
- **action-center**: execute (financial/scoped), resolve, dismiss, snooze
- **settings (admin)**: workspace update, update-member-role — permission + tenant stay on `authorizeSettingsAction`; the gate adds the billing entitlement (`intent: "admin"`: reachable in trial_expired, blocked under suspension / security hold)

### Automation execution — no user-facing surface (by design)

There is **no user-triggered "run automation" action**. Automations are handlers dispatched by `dispatchDomainEvent`, which is called **only** from `emitDomainEvent` (server-only) *after* a mutation succeeds. Since every triggering mutation is now gated by `requireAppAccess`, an automation can only fire behind a write that was already allowed; handler writes additionally run under the user's RLS-scoped session. `dispatchDomainEvent` is never wired to a client component, so it is not an exposed Server Action endpoint. The spec's "automation execution denied when not writable" is therefore satisfied structurally, without a separate guard.

Conventions used:
- Quota: actions with atomic `reserveOrganizationUsage` keep it — the guard omits `capability` to avoid double-counting. `invite` consolidates `members` capability into the guard.
- Delete semantics matched to the DB op: hard DELETE → `data.delete`; soft-delete (UPDATE `deleted_at`) → `data.write`; archive → `data.delete`.
- Module-specific granular checks (`hasDocumentPermission`, `canDo`, role checks) are **kept** as defense-in-depth with their localized messages; the guard adds tenant + base-permission + billing entitlement.

### Follow-up (not yet on the guard — lower stakes)

CRM (`create/update/delete client`, contacts, deals, activities, notes), booking (hosts/services/availability/requests), analytics (reports/snapshots/widgets), AI generate-* actions, planner accept/edit/reject, relations create/delete, notifications, settings profile/avatar/push-subscription, `init-subscription` (deprecated no-op).

These are paused/secondary modules (CRM, booking) or low-stakes surfaces; their existing permission + RLS enforcement is unchanged and they carry no billing-writable-state risk that RLS doesn't already cover.

These follow the same mechanical pattern:
```ts
let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
try {
  ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
} catch (err) {
  const denied = accessErrorToActionResult(err);
  if (denied) return denied;
  throw err;
}
```

## Tests
- `lib/security/entitlements.test.ts` — every state × intent decision + code mapping.
- `lib/security/require-app-access.test.ts` — happy path, tenant mismatch, permission denied, trial-expired write denial, past-due invite freeze, developer-unlimited, limit-reached, direct-bypass scenarios.
- Existing action unit tests mock the `@/lib/security` boundary (the guard is covered by its own suite).

Checks: `npm run lint`, `npx next typegen`, `npx tsc --noEmit`, `npm test` (711 passed), `npm run build` — all green.
