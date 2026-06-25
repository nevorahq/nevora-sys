"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog } from "@/lib/events";
import { createInviteLinkSchema } from "../schemas/member.schemas";
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
  const { org, membership } = await requireOrg();

  if (!["owner", "admin"].includes(membership.roleId)) {
    return { error: "Only owners and admins can create invite links" };
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
      if (error?.message.includes("trial_expired")) {
        return { error: "Your trial has ended. Choose a plan to invite members." };
      }
      if (error?.message.includes("not_authorized")) {
        return { error: "Only owners and admins can create invite links" };
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
