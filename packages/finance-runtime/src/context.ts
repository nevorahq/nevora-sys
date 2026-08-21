import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceRequestContext, FinanceServiceClaims } from "@nevora/finance-api";

export class FinanceRuntimeIdentityError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus = 403) {
    super(message);
    this.name = "FinanceRuntimeIdentityError";
    this.httpStatus = httpStatus;
  }
}

/** Revalidate signed tenant claims against current organization state. */
export async function resolveFinanceRuntimeContext(
  supabase: SupabaseClient,
  claims: FinanceServiceClaims,
): Promise<Readonly<FinanceRequestContext>> {
  const [organizationResult, workspaceResult, membershipResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id")
      .eq("id", claims.organizationId)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select("id")
      .eq("id", claims.workspaceId)
      .eq("organization_id", claims.organizationId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, role")
      .eq("organization_id", claims.organizationId)
      .eq("user_id", claims.subject)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const membership = membershipResult.data;
  if (!organizationResult.data || !workspaceResult.data || !membership) {
    throw new FinanceRuntimeIdentityError("Service identity is no longer authorized.");
  }

  const livePermissions = permissionsForRole(membership.role as string);
  const permissions = claims.permissions.filter((permission) =>
    livePermissions.has(permission),
  );

  return Object.freeze({
    organizationId: claims.organizationId,
    workspaceId: claims.workspaceId,
    actorId: claims.subject,
    permissions: Object.freeze(permissions),
  });
}

function permissionsForRole(role: string): ReadonlySet<string> {
  // Mirrors the current platform RBAC subset relevant to the Finance port.
  if (["owner", "admin", "manager", "member"].includes(role)) {
    return new Set(["org.read", "data.write"]);
  }
  return new Set();
}
