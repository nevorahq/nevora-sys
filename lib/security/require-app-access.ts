import "server-only";

import { requireOrg } from "@/lib/auth/require-org";
import { getOrganizationAccessState } from "@/modules/billing/queries/get-organization-access-state";
import { checkPlanLimit } from "@/lib/billing/check-limit";
import type { UsageMetric } from "@/modules/billing";
import type { CurrentContext } from "@/lib/context/current-context";
import type { OrgAccessState } from "@/modules/billing/types/entitlement.types";
import { AccessError } from "./access-errors";
import { hasPermission, type AppPermission } from "./permissions";
import { evaluateEntitlement, type AccessIntent } from "./entitlements";
import { auditSecurityEvent } from "./audit-security-event";

/**
 * Centralized backend authorization + entitlement gate (Phase 2).
 *
 * Every user-triggered mutation runs through this single funnel:
 *
 *   auth → org/workspace context → tenant match → membership → permission →
 *   billing entitlement (intent × access-state) → plan capability → (mutation)
 *
 * It COMPOSES the existing spine rather than replacing it:
 *   - `requireOrg()` resolves user + active membership + org + workspace + role
 *     + permissions from server-side context, never from client payload
 *     (redirects for unauthenticated / no-membership — the app's convention).
 *   - `get_organization_access_state` (089) yields the typed billing state.
 *   - `checkPlanLimit` enforces plan quotas + `is_organization_writable`.
 *
 * The database (RLS + `can_write_org`) remains the authoritative boundary; this
 * gate adds defense-in-depth and, crucially, *typed* refusals so the UI can
 * tell "no permission" apart from "trial expired" apart from "past due".
 *
 * @throws {AccessError} on tenant mismatch, missing permission, disallowed
 *   billing state, or exceeded plan limit. Auth / no-org / no-membership follow
 *   `requireOrg()` and redirect.
 */
export interface RequireAppAccessOptions {
  /**
   * Organization the action claims to target. When provided it MUST equal the
   * server-resolved active org — a mismatch is a cross-tenant attempt and is
   * rejected. Never used to *select* the org (that always comes from context).
   */
  organizationId?: string;
  /** Workspace the action claims to target; verified the same way. */
  workspaceId?: string;
  /**
   * Permission the caller must hold (e.g. `data.write`, `billing.manage`,
   * `action_center.execute.financial`). Omit for pure reads.
   */
  permission?: AppPermission | (string & {});
  /**
   * Plan capability (usage metric) to check headroom for, e.g. `tasks`,
   * `money_transactions`, `documents`, `members`. Only enforced for
   * write/invite/execute intents.
   */
  capability?: UsageMetric;
  /** Units the action will consume for `capability` (default 1). */
  capabilityAmount?: number;
  /** What the caller is doing — drives the entitlement matrix. */
  intent: AccessIntent;
}

/** Resolved, verified context returned to the action. Superset of CurrentContext. */
export interface AppAccessContext extends CurrentContext {
  accessState: OrgAccessState;
}

export async function requireAppAccess(
  options: RequireAppAccessOptions,
): Promise<AppAccessContext> {
  const { organizationId, workspaceId, permission, capability, intent } = options;

  // 1–5. Auth + active membership + org + workspace + role + permissions.
  //       requireOrg redirects for unauthenticated / no active membership.
  const ctx = await requireOrg();

  // 3/4. Reject cross-tenant payloads. We never trust a client-supplied
  //      org/workspace to *select* context — only to assert it matches.
  if (organizationId && organizationId !== ctx.org.id) {
    auditSecurityEvent({
      action: "tenant_mismatch",
      code: "INVALID_TENANT_CONTEXT",
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      organizationId: ctx.org.id,
      intent,
      metadata: { requestedOrganizationId: organizationId },
    });
    throw new AccessError("INVALID_TENANT_CONTEXT");
  }
  if (workspaceId && workspaceId !== ctx.workspace.id) {
    auditSecurityEvent({
      action: "tenant_mismatch",
      code: "INVALID_TENANT_CONTEXT",
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      organizationId: ctx.org.id,
      workspaceId: ctx.workspace.id,
      intent,
      metadata: { requestedWorkspaceId: workspaceId },
    });
    throw new AccessError("INVALID_TENANT_CONTEXT");
  }

  // 6. Permission (RBAC derived from role in requireOrg).
  if (permission && !hasPermission(ctx.permissions, permission)) {
    auditSecurityEvent({
      action: "permission_denied",
      code: "PERMISSION_DENIED",
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      organizationId: ctx.org.id,
      permission,
      intent,
    });
    throw new AccessError("PERMISSION_DENIED");
  }

  // 7/8. Billing entitlement: typed access state × intent matrix.
  const accessState = await getOrganizationAccessState(ctx.org.id);
  const decision = evaluateEntitlement(accessState, intent);
  if (!decision.allowed) {
    const code = decision.code ?? "BILLING_REQUIRED";
    auditSecurityEvent({
      action: "entitlement_denied",
      code,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      organizationId: ctx.org.id,
      intent,
      metadata: { accessState },
    });
    throw new AccessError(code);
  }

  // 8b. Plan capability / quota — only meaningful for state-changing intents.
  //     checkPlanLimit short-circuits to allowed for developer-unlimited and
  //     also re-checks is_organization_writable (belt-and-braces with 7/8).
  if (capability && (intent === "write" || intent === "invite" || intent === "execute")) {
    const limit = await checkPlanLimit(ctx.org.id, capability, options.capabilityAmount ?? 1);
    if (!limit.allowed) {
      throw new AccessError("LIMIT_REACHED", limit.reason);
    }
  }

  return { ...ctx, accessState };
}
