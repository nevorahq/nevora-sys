"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { emitAuditLog } from "@/lib/events";
import { createInviteLinkSchema } from "../schemas/member.schemas";
import {
  auditInviteDecision,
  inviteReasonFromMessage,
  inviteSenderMessage,
} from "../services/invite-protection";
import type { ActionResult } from "@/lib/validators/common";

export type CreateInviteLinkResult = ActionResult & { token?: string };

/**
 * Owner/admin создаёт ссылку-приглашение (токен). Возвращает токен —
 * клиент строит полный URL (origin + /invite/<token>) и копирует его.
 */
export async function createInviteLinkAction(
  _prevState: CreateInviteLinkResult,
  formData: FormData,
): Promise<CreateInviteLinkResult> {
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
    return { error: inviteSenderMessage("permission_denied") };
  }

  const parsed = createInviteLinkSchema.safeParse({
    role: (formData.get("role") as string) || "member",
  });
  if (!parsed.success) return { error: "Invalid role" };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_invite_link", {
      p_org_id: org.id,
      p_role:   parsed.data.role,
    });

    if (error || !data) {
      const reason = inviteReasonFromMessage(error?.message);
      auditInviteDecision({
        action: "send",
        reason,
        organizationId: org.id,
        actorId: membership.userId,
        role: parsed.data.role,
      });
      if (reason === "member_limit_reached"
        || reason === "trial_expired"
        || reason === "organization_restricted"
        || reason === "paid_plan_required"
        || reason === "role_not_allowed") {
        return { error: inviteSenderMessage(reason) };
      }
      if (error?.message.includes("not_authorized")) {
        return { error: inviteSenderMessage("permission_denied") };
      }
      console.error("createInviteLink RPC error:", error);
      return { error: "Failed to create invite link" };
    }

    await emitAuditLog({
      organizationId: org.id,
      entityType:     "organization_invites",
      entityId:       "",
      action:         "create",
      newData:        { role: parsed.data.role },
      metadata:       { source: "dashboard" },
    });

    return { token: data as string };
  } catch (err) {
    console.error("createInviteLink unexpected error:", err);
    return { error: "Server error" };
  }
}
