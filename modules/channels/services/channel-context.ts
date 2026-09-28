import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { permissionsForRole } from "@/lib/auth/require-org";
import { canDo, type CurrentContext } from "@/lib/context/current-context";
import type { ChannelIntegration } from "../types";

export type ChannelContextResult =
  | { ok: true; ctx: CurrentContext }
  /** The linked user left the organization (or it no longer exists). */
  | { ok: false; reason: "not_member" }
  /** Their role cannot capture. */
  | { ok: false; reason: "forbidden" }
  /** The organization is read-only (trial over, subscription paused, …). */
  | { ok: false; reason: "read_only" };

/**
 * Rebuild the linked user's context for a channel message — there is no
 * session on a webhook, so this stands in for `requireAppAccess` with the same
 * checks: an active membership, the role's RBAC set (`permissionsForRole`, the
 * one `requireOrg` uses), capture permission, and a writable organization
 * (`is_organization_writable`, the database's own write gate).
 *
 * `supabase` is the service-role client: the caller has already matched the
 * sender to an integration, so the identity is established; every write that
 * follows is scoped explicitly to this context's organization and user.
 */
export async function resolveChannelContext(
  supabase: SupabaseClient,
  integration: Pick<ChannelIntegration, "organization_id" | "workspace_id" | "user_id">,
): Promise<ChannelContextResult> {
  const organizationId = integration.organization_id;

  const [organizationResult, membershipResult, workspaceResult] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, plan, base_currency").eq("id", organizationId).maybeSingle(),
    supabase
      .from("memberships")
      .select("id, organization_id, user_id, role, status, created_at")
      .eq("organization_id", organizationId)
      .eq("user_id", integration.user_id)
      .eq("status", "active")
      .maybeSingle(),
    loadWorkspace(supabase, organizationId, integration.workspace_id),
  ]);

  const organization = organizationResult.data;
  const membership = membershipResult.data;
  if (!organization || !membership || !workspaceResult) return { ok: false, reason: "not_member" };

  const roleName = membership.role as string;
  const ctx: CurrentContext = {
    user: {
      id: integration.user_id,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "",
    } as User,
    org: {
      id: organization.id as string,
      name: organization.name as string,
      slug: (organization.slug as string | null) ?? "",
      plan: organization.plan as string,
      logoUrl: null,
      baseCurrency: (organization.base_currency as string | null) ?? "EUR",
    },
    workspace: { id: workspaceResult.id, name: workspaceResult.name, slug: "", description: null },
    membership: {
      id: membership.id as string,
      organizationId,
      userId: integration.user_id,
      roleId: roleName,
      status: "active",
      joinedAt: (membership.created_at as string | null) ?? null,
    },
    role: { id: roleName, name: roleName, isSystem: true, organizationId },
    permissions: permissionsForRole(roleName),
  };

  if (!canDo(ctx, "planner.entry.create") || !canDo(ctx, "data.write")) return { ok: false, reason: "forbidden" };

  const { data: writable, error } = await supabase.rpc("is_organization_writable", {
    p_organization_id: organizationId,
  });
  if (error || writable !== true) return { ok: false, reason: "read_only" };

  return { ok: true, ctx };
}

/** The integration's workspace when it still exists, else the org's first one (as requireOrg). */
async function loadWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
  workspaceId: string | null,
): Promise<{ id: string; name: string } | null> {
  if (workspaceId) {
    const { data } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (data) return { id: data.id as string, name: data.name as string };
  }
  const { data } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string, name: data.name as string } : null;
}
