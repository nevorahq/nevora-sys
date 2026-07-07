"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { emitAuditLog } from "@/lib/events";
import { maskEmail } from "@/lib/email";
import { inviteMemberSchema } from "../schemas/member.schemas";
import {
  auditInviteDecision,
  inviteReasonFromMessage,
  inviteSenderMessage,
} from "../services/invite-protection";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Пригласить участника по email (существующего юзера) → membership invited.
 *
 * Проверки (defense in depth):
 *   1. requireOrg + роль owner/admin (UX-уровень)
 *   2. checkPlanLimit('members') — дружелюбное сообщение до RPC
 *   3. invite_member() RPC — реальный guard: admin-check + лимит + поиск юзера
 *      (нельзя обойти прямым вызовом RPC мимо этого action)
 */
export async function inviteMemberAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Guard: users.manage (owner/admin) + invite entitlement (invites freeze on
  // trial_expired / past_due) + members plan-limit — one funnel replaces the
  // ad-hoc role check + checkPlanLimit. The invite_member RPC below stays the
  // authoritative guard against direct calls.
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "users.manage", capability: "members", intent: "invite" });
  } catch (err) {
    if (isAccessError(err)) {
      return {
        error: inviteSenderMessage(err.code === "LIMIT_REACHED" ? "member_limit_reached" : "organization_restricted"),
      };
    }
    throw err;
  }
  const { org, membership } = ctx;

  if (!["owner", "admin"].includes(membership.roleId)) {
    return { error: "Only owners and admins can invite members" };
  }

  const parsed = inviteMemberSchema.safeParse({
    email: formData.get("email") as string,
    role:  (formData.get("role") as string) || "member",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { fieldErrors };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("invite_member", {
      p_org_id: org.id,
      p_email:  parsed.data.email,
      p_role:   parsed.data.role,
    });

    if (error) {
      const reason = inviteReasonFromMessage(error.message);
      auditInviteDecision({
        action: "send",
        reason,
        organizationId: org.id,
        actorId: membership.userId,
        role: parsed.data.role,
      });
      const m = error.message;
      if (m.includes("user_not_found")) {
        return { fieldErrors: { email: ["No account with this email. Ask them to sign up first."] } };
      }
      if (m.includes("already_member")) {
        return { fieldErrors: { email: ["This user is already in the organization."] } };
      }
      if (
        reason === "member_limit_reached"
        || reason === "trial_expired"
        || reason === "organization_restricted"
        || reason === "paid_plan_required"
        || reason === "trial_already_used"
        || reason === "billing_owner_restricted"
        || reason === "role_not_allowed"
      ) {
        return { error: inviteSenderMessage(reason) };
      }
      if (m.includes("not_authorized")) {
        return { error: inviteSenderMessage("permission_denied") };
      }
      console.error("inviteMember RPC error:", error);
      return { error: "Failed to invite member" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "memberships",
      entityId:       (data as string) ?? "",
      action:         "create",
      // No raw email in audit_logs — mask the local part (support-triage only).
      newData:        { email: maskEmail(parsed.data.email), role: parsed.data.role, status: "invited" },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("inviteMember unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.members);
  return {};
}
