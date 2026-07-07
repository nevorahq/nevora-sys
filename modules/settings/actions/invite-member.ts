"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { maskEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import {
  auditInviteDecision,
  inviteReasonFromMessage,
  inviteSenderMessage,
} from "@/modules/members/services/invite-protection";
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
    // Entitlement + plan-limit funnel: invites freeze on trial_expired /
    // past_due, and members capability is checked here (replaces checkPlanLimit).
    try {
      await requireAppAccess({ permission: "users.manage", capability: "members", intent: "invite" });
    } catch (err) {
      if (isAccessError(err)) {
        return {
          error: inviteSenderMessage(err.code === "LIMIT_REACHED" ? "member_limit_reached" : "organization_restricted"),
        };
      }
      throw err;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("invite_member", {
      p_org_id: context.org.id,
      p_email: parsed.data.email,
      p_role: parsed.data.role,
    });

    if (error) {
      const reason = inviteReasonFromMessage(error.message);
      auditInviteDecision({
        action: "send",
        reason,
        organizationId: context.org.id,
        actorId: context.user.id,
        role: parsed.data.role,
      });
      if (error.message.includes("user_not_found")) return { fieldErrors: { email: ["This person needs a Nevora account first."] } };
      if (error.message.includes("already_member")) return { fieldErrors: { email: ["This person is already a member."] } };
      if (reason === "member_limit_reached"
        || reason === "trial_expired"
        || reason === "organization_restricted"
        || reason === "paid_plan_required"
        || reason === "trial_already_used"
        || reason === "billing_owner_restricted"
        || reason === "role_not_allowed") {
        return { error: inviteSenderMessage(reason) };
      }
      return { error: "The invitation could not be created." };
    }

    const membershipId = (data as string) ?? context.org.id;
    await Promise.all([
      emitAuditLog({
        organizationId: context.org.id,
        entityType: "memberships",
        entityId: membershipId,
        action: "invite",
        // No raw email in audit_logs / domain_events — mask the local part.
        newData: { email: maskEmail(parsed.data.email), role: parsed.data.role },
        metadata: { source: "dashboard" },
      }),
      emitDomainEvent({
        organizationId: context.org.id,
        workspaceId: context.workspace.id,
        eventName: "member.invited",
        aggregateType: "membership",
        aggregateId: membershipId,
        // email is a validated, required field, so maskEmail is always a string
        // here; the ?? keeps the strict event-payload type happy.
        payload: { email: maskEmail(parsed.data.email) ?? "***", role: parsed.data.role },
      }),
    ]);
    revalidatePath(ROUTES.settingsMembers);
    return { success: "Invitation created." };
  } catch (error) {
    console.error("inviteMember error:", error);
    return { error: "The invitation could not be created." };
  }
}
