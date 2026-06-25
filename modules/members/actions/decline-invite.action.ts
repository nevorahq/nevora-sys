"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { inviteResponseSchema } from "../schemas/member.schemas";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Приглашённый отклоняет инвайт: own invited membership удаляется (через RPC).
 */
export async function declineInviteAction(
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
    const { error } = await supabase.rpc("decline_invite", {
      p_org_id: parsed.data.organizationId,
    });
    if (error) {
      console.error("declineInvite RPC error:", error);
      return { error: "Failed to decline invite" };
    }
  } catch (err) {
    console.error("declineInvite unexpected error:", err);
    return { error: "Server error" };
  }

  revalidatePath(ROUTES.dashboard);
  return {};
}
