"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { emitAuditLog, emitDomainEvent } from "@/lib/events";
import { uuidSchema } from "@/lib/validators/common";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/** Removes a non-owner teammate from the current organization. */
export async function removeMemberAction(memberId: string): Promise<ActionResult> {
  const { org, membership } = await requireOrg();

  if (!uuidSchema.safeParse(memberId).success) return { error: "Invalid member" };
  if (!["owner", "admin"].includes(membership.roleId)) {
    return { error: "Only owners and admins can remove members" };
  }

  try {
    const supabase = await createClient();
    const { data: target, error: targetError } = await supabase
      .from("memberships")
      .select("id, user_id, role, status")
      .eq("id", memberId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (targetError || !target) return { error: "Member not found" };
    if (target.user_id === membership.userId) {
      return { error: "You cannot remove yourself from this screen" };
    }
    if (target.role === "owner") {
      return { error: "The organization owner cannot be removed" };
    }

    const { error } = await supabase
      .from("memberships")
      .delete()
      .eq("id", target.id)
      .eq("organization_id", org.id);

    if (error) {
      if (error.message.includes("row-level security")) {
        return { error: "Your trial has ended. Choose a plan to manage members." };
      }
      console.error("removeMember error:", error);
      return { error: "Failed to remove member" };
    }

    await Promise.all([
      emitDomainEvent({
        organizationId: org.id,
        eventName: "member.removed",
        aggregateType: "membership",
        aggregateId: target.id,
        payload: { role: target.role },
      }),
      emitAuditLog({
        organizationId: org.id,
        entityType: "memberships",
        entityId: target.id,
        action: "delete",
        oldData: { user_id: target.user_id, role: target.role, status: target.status },
        metadata: { source: "dashboard" },
      }),
    ]);
  } catch (err) {
    console.error("removeMember unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.members);
  return {};
}
