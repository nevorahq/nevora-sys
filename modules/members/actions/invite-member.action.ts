"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { checkPlanLimit } from "@/lib/billing";
import { emitAuditLog } from "@/lib/events";
import { inviteMemberSchema } from "../schemas/member.schemas";
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
  const { org, membership } = await requireOrg();

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

  const limitCheck = await checkPlanLimit(org.id, "members");
  if (!limitCheck.allowed) {
    return { error: limitCheck.reason ?? "Member limit reached. Upgrade your plan." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("invite_member", {
      p_org_id: org.id,
      p_email:  parsed.data.email,
      p_role:   parsed.data.role,
    });

    if (error) {
      const m = error.message;
      if (m.includes("user_not_found")) {
        return { fieldErrors: { email: ["No account with this email. Ask them to sign up first."] } };
      }
      if (m.includes("already_member")) {
        return { fieldErrors: { email: ["This user is already in the organization."] } };
      }
      if (m.includes("member_limit_reached")) {
        return { error: "Member limit reached. Upgrade your plan." };
      }
      if (m.includes("trial_expired")) {
        return { error: "Your trial has ended. Choose a plan to invite members." };
      }
      if (m.includes("not_authorized")) {
        return { error: "Only owners and admins can invite members" };
      }
      console.error("inviteMember RPC error:", error);
      return { error: "Failed to invite member" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "memberships",
      entityId:       (data as string) ?? "",
      action:         "create",
      newData:        { email: parsed.data.email, role: parsed.data.role, status: "invited" },
      metadata:       { source: "dashboard" },
    });
  } catch (err) {
    console.error("inviteMember unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.members);
  return {};
}
