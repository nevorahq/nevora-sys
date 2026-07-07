"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { ROUTES } from "@/shared/config/routes";
import { memberRoleSchema } from "../schemas/member-role.schema";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import type { SettingsActionState } from "../types/settings.types";

export async function updateMemberRole(memberId: string, role: string): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("members.update_role");
  if (!context) return { error: "Only owners and admins can update roles." };

  // Role changes mutate membership privileges, so they follow the same
  // restricted-state write gate as business mutations.
  try {
    await requireAppAccess({ permission: "users.manage", intent: "write" });
  } catch (err) {
    if (isAccessError(err)) return { error: err.message };
    throw err;
  }

  const parsed = memberRoleSchema.safeParse({ memberId, role });
  if (!parsed.success) return { error: "Choose a supported role." };

  try {
    const supabase = await createClient();
    const { data: target } = await supabase
      .from("memberships")
      .select("id, user_id, role")
      .eq("id", parsed.data.memberId)
      .eq("organization_id", context.org.id)
      .single();

    if (!target) return { error: "Member not found." };
    if (target.role === "owner") return { error: "Owner role cannot be changed here." };
    if (target.user_id === context.user.id) return { error: "You cannot change your own role." };

    const { error } = await supabase
      .from("memberships")
      .update({ role: parsed.data.role })
      .eq("id", target.id)
      .eq("organization_id", context.org.id);
    if (error) return { error: "The member role could not be updated." };

    await Promise.all([
      emitAuditLog({
        organizationId: context.org.id,
        entityType: "memberships",
        entityId: target.id,
        action: "role_change",
        oldData: { role: target.role },
        newData: { role: parsed.data.role },
        metadata: { source: "dashboard" },
      }),
      emitDomainEvent({
        organizationId: context.org.id,
        workspaceId: context.workspace.id,
        eventName: "member.role_changed",
        aggregateType: "membership",
        aggregateId: target.id,
        payload: { old_role: target.role as string, new_role: parsed.data.role },
      }),
    ]);
    revalidatePath(ROUTES.settingsMembers);
    return { success: "Role updated." };
  } catch (error) {
    console.error("updateMemberRole error:", error);
    return { error: "The member role could not be updated." };
  }
}
