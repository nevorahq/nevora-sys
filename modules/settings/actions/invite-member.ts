"use server";

import { revalidatePath } from "next/cache";
import { checkPlanLimit } from "@/lib/billing";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { ROUTES } from "@/shared/config/routes";
import { inviteMemberSchema } from "../schemas/invite-member.schema";
import { authorizeSettingsAction } from "../utils/settings-permissions";
import { zodActionError } from "../utils/action-errors";
import type { SettingsActionState } from "../types/settings.types";

export async function inviteMember(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const context = await authorizeSettingsAction("members.invite");
  if (!context) return { error: "Only owners and admins can invite members." };

  const parsed = inviteMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") || "member",
  });
  if (!parsed.success) return zodActionError(parsed.error);

  try {
    const limit = await checkPlanLimit(context.org.id, "members");
    if (!limit.allowed) return { error: limit.reason ?? "Your member limit has been reached." };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("invite_member", {
      p_org_id: context.org.id,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    });

    if (error) {
      if (error.message.includes("user_not_found")) return { fieldErrors: { email: ["This person needs a Nevora account first."] } };
      if (error.message.includes("already_member")) return { fieldErrors: { email: ["This person is already a member."] } };
      if (error.message.includes("member_limit_reached")) return { error: "Your member limit has been reached." };
      return { error: "The invitation could not be created." };
    }

    const membershipId = (data as string) ?? context.org.id;
    await Promise.all([
      emitAuditLog({
        organizationId: context.org.id,
        entityType: "memberships",
        entityId: membershipId,
        action: "invite",
        newData: { email: parsed.data.email, role: parsed.data.role },
        metadata: { source: "dashboard" },
      }),
      emitDomainEvent({
        organizationId: context.org.id,
        workspaceId: context.workspace.id,
        eventName: "member.invited",
        aggregateType: "membership",
        aggregateId: membershipId,
        payload: { email: parsed.data.email, role: parsed.data.role },
      }),
    ]);
    revalidatePath(ROUTES.settingsMembers);
    return { success: "Invitation created." };
  } catch (error) {
    console.error("inviteMember error:", error);
    return { error: "The invitation could not be created." };
  }
}
