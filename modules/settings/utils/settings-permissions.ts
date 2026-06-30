import "server-only";

import { requireOrg } from "@/lib/auth/require-org";
import type { CurrentContext } from "@/lib/context/current-context";
import type { SettingsPermission } from "../types/settings.types";

const ADMIN_PERMISSIONS = new Set<SettingsPermission>([
  "workspace.read",
  "workspace.update",
  "members.read",
  "members.invite",
  "members.update_role",
  "members.remove",
  "billing.read",
  "billing.manage",
]);

export function hasSettingsPermission(
  context: CurrentContext,
  permission: SettingsPermission,
): boolean {
  if (permission === "profile.read" || permission === "profile.update") return true;

  // Compatibility layer: centralize role fallback here until permissions are persisted.
  if (["owner", "admin"].includes(context.membership.roleId)) {
    return ADMIN_PERMISSIONS.has(permission);
  }

  const existingPermission = {
    "workspace.read": "workspace.manage",
    "workspace.update": "workspace.manage",
    "members.read": "users.manage",
    "members.invite": "users.manage",
    "members.update_role": "users.manage",
    "members.remove": "users.manage",
    "billing.read": "billing.manage",
    "billing.manage": "billing.manage",
  }[permission];

  return existingPermission ? context.permissions.has(existingPermission) : false;
}

export async function requireSettingsPermission(permission: SettingsPermission) {
  const context = await requireOrg();
  if (!hasSettingsPermission(context, permission)) {
    throw new Error("FORBIDDEN");
  }
  return context;
}

/** Action-friendly guard: preserves auth redirects and models forbidden as null. */
export async function authorizeSettingsAction(permission: SettingsPermission) {
  const context = await requireOrg();
  return hasSettingsPermission(context, permission) ? context : null;
}
