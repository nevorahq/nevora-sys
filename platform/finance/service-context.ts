import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { FinanceServiceClaims } from "@nevora/finance-api";
import type { CurrentContext } from "@/lib/context/current-context";

export class FinanceServiceIdentityError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus = 403) {
    super(message);
    this.name = "FinanceServiceIdentityError";
    this.httpStatus = httpStatus;
  }
}

/** Rebuild and verify a root-app context from already signed service claims. */
export async function resolveFinanceServiceContext(
  supabase: SupabaseClient,
  claims: FinanceServiceClaims,
): Promise<CurrentContext> {
  const [organizationResult, workspaceResult, membershipResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, plan, base_currency")
      .eq("id", claims.organizationId)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", claims.workspaceId)
      .eq("organization_id", claims.organizationId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("id, organization_id, user_id, role, status, created_at")
      .eq("organization_id", claims.organizationId)
      .eq("user_id", claims.subject)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  const organization = organizationResult.data;
  const workspace = workspaceResult.data;
  const membership = membershipResult.data;
  if (!organization || !workspace || !membership) {
    throw new FinanceServiceIdentityError("Service identity is no longer authorized.");
  }

  const roleName = membership.role as string;
  const user = {
    id: claims.subject,
    aud: "authenticated",
    role: "authenticated",
    email: undefined,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "",
  } as User;

  return {
    user,
    org: {
      id: organization.id as string,
      name: organization.name as string,
      slug: (organization.slug as string | null) ?? "",
      plan: organization.plan as string,
      logoUrl: null,
      baseCurrency: (organization.base_currency as string | null) ?? "EUR",
    },
    workspace: {
      id: workspace.id as string,
      name: workspace.name as string,
      slug: "",
      description: null,
    },
    membership: {
      id: membership.id as string,
      organizationId: membership.organization_id as string,
      userId: membership.user_id as string,
      roleId: roleName,
      status: "active",
      joinedAt: (membership.created_at as string | null) ?? null,
    },
    role: {
      id: roleName,
      name: roleName,
      isSystem: true,
      organizationId: claims.organizationId,
    },
    permissions: new Set(claims.permissions),
  };
}
