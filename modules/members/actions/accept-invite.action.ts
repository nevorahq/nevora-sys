"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { setSelectedOrganizationId } from "@/lib/auth/organization-cookie";
import { inviteResponseSchema } from "../schemas/member.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Приглашённый принимает инвайт: own membership invited→active (через RPC).
 * Использует requireUser (а не requireOrg): у invited-only юзера может не быть
 * активной организации.
 *
 * После успеха организация, в которую только что вступил пользователь,
 * становится выбранной активной (setSelectedOrganizationId) — RPC уже
 * подтвердила, что это его собственное membership (auth.uid()), так что
 * cross-tenant риска нет.
 */
export async function acceptInviteAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();

  const parsed = inviteResponseSchema.safeParse({
    organizationId: formData.get("organizationId") as string,
  });
  if (!parsed.success) return { error: "Invalid invite" };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("accept_invite", {
      p_org_id: parsed.data.organizationId,
    });
    if (error) {
      if (error.message.includes("invite_not_found")) {
        return { error: "Invite not found or already handled" };
      }
      console.error("acceptInvite RPC error:", error);
      return { error: "Failed to accept invite" };
    }
  } catch (err) {
    console.error("acceptInvite unexpected error:", err);
    return { error: "Server error" };
  }

  await setSelectedOrganizationId(parsed.data.organizationId);
  revalidatePath(ROUTES.dashboard);
  revalidatePath(ROUTES.onboarding);
  return {};
}
