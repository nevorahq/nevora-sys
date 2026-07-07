"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { removeMemberSchema } from "../schemas/member-role.schema";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import type { SettingsActionState } from "../types/settings.types";

export async function removeMember(memberId: string): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("members.remove");
  if (!context) return { error: "Only owners and admins can remove members." };

  try {
    await requireAppAccess({ permission: "users.manage", intent: "write" });
  } catch (err) {
    if (isAccessError(err)) return { error: err.message };
    throw err;
  }

  const parsed = removeMemberSchema.safeParse({ memberId });
  if (!parsed.success) return { error: "Invalid member." };

  try {
    const supabase = await createClient();
    const { data: target } = await supabase
      .from("memberships")
      .select("id, user_id, role, status")
      .eq("id", parsed.data.memberId)
      .eq("organization_id", context.org.id)
      .single();

    if (!target) return { error: "Member not found." };
    if (target.role === "owner") return { error: "The owner cannot be removed." };
    if (target.user_id === context.user.id) return { error: "You cannot remove yourself here." };

    const { error } = await supabase
      .from("memberships")
      .delete()
      .eq("id", target.id)
      .eq("organization_id", context.org.id);
    if (error) return { error: "The member could not be removed." };

    await Promise.all([
      emitAuditLog({
        organizationId: context.org.id,
        entityType: "memberships",
        entityId: target.id,
        action: "delete",
        oldData: { user_id: target.user_id, role: target.role, status: target.status },
        metadata: { source: "dashboard" },
      }),
      emitDomainEvent({
        organizationId: context.org.id,
        workspaceId: context.workspace.id,
        eventName: "member.removed",
        aggregateType: "membership",
        aggregateId: target.id,
        payload: { role: target.role as string },
      }),
    ]);
    revalidatePath(ROUTES.settingsMembers);
    return { success: "Member removed." };
  } catch (error) {
    console.error("removeMember error:", error);
    return { error: "The member could not be removed." };
  }
}
