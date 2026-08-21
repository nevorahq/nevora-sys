import type { SupabaseClient } from "@supabase/supabase-js";
import type { TasksRequestContext, TasksServiceClaims } from "@nevora/tasks-api";

export class TasksRuntimeIdentityError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus = 403) {
    super(message);
    this.name = "TasksRuntimeIdentityError";
    this.httpStatus = httpStatus;
  }
}

/** Revalidate signed tenant claims against current organization state. */
export async function resolveTasksRuntimeContext(
  supabase: SupabaseClient,
  claims: TasksServiceClaims,
): Promise<Readonly<TasksRequestContext>> {
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
    throw new TasksRuntimeIdentityError("Service identity is no longer authorized.");
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
  // Mirrors the current platform RBAC subset relevant to the Tasks port.
  if (["owner", "admin", "manager", "member"].includes(role)) {
    return new Set(["org.read", "data.write"]);
  }
  return new Set();
}
