/**
 * Permission catalogue + helpers for the authorization gate (Phase 2).
 *
 * The source of truth for *which role holds which permission* remains
 * `ROLE_PERMISSIONS` in `lib/auth/require-org.ts` (derived from role, mirroring
 * `can_write_data()` / RBAC in migration 002). `requireOrg()` already resolves
 * that into `CurrentContext.permissions`. This module does NOT re-derive
 * permissions — it only names the well-known permission strings and provides a
 * single membership check so the guard and callers share one spelling.
 */

/**
 * Well-known permission strings referenced by the guard's callers. This is a
 * convenience catalogue for the critical write paths — `permission` on
 * `requireAppAccess` is intentionally typed `AppPermission | (string & {})` so
 * module-specific permissions (e.g. `action_center.execute.financial`) remain
 * valid without enumerating every one here.
 */
export const PERMISSIONS = {
  dataWrite: "data.write",
  dataDelete: "data.delete",
  membersInvite: "users.manage",
  billingManage: "billing.manage",
  workspaceManage: "workspace.manage",
  actionCenterExecute: "action_center.execute",
  actionCenterExecuteFinancial: "action_center.execute.financial",
  actionCenterResolve: "action_center.resolve",
  actionCenterDismiss: "action_center.dismiss",
} as const;

export type AppPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Does the resolved context hold `permission`?
 *
 * Mirrors `canDo()` in current-context, but takes the raw permission set so it
 * can be used both with a full `CurrentContext` and in isolation (tests).
 */
export function hasPermission(
  permissions: ReadonlySet<string>,
  permission: string,
): boolean {
  return permissions.has(permission);
}
