"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { acceptInviteLinkSchema } from "../schemas/member.schemas";
import {
  auditInviteDecision,
  inviteReasonFromMessage,
  inviteRecipientMessage,
} from "../services/invite-protection";
import { ROUTES } from "@/shared/config/routes";
import type { ActionResult } from "@/lib/validators/common";

/**
 * Залогиненный пользователь принимает приглашение по токену.
 * При успехе membership создаётся active → redirect на dashboard.
 */
export async function acceptInviteLinkAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = acceptInviteLinkSchema.safeParse({
    token: formData.get("token") as string,
  });
  if (!parsed.success) return { error: "Invalid invite link" };

  let ok = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("accept_invite_link", {
      p_token: parsed.data.token,
    });

    if (error) {
      const reason = inviteReasonFromMessage(error.message);
      auditInviteDecision({
        action: "accept",
        reason,
        actorId: user.id,
        targetUserId: user.id,
      });
      if (reason === "auth_required") return { error: "Authentication required" };
      console.error("acceptInviteLink RPC error:", error);
      return { error: inviteRecipientMessage(reason) };
    }
    ok = true;
  } catch (err) {
    console.error("acceptInviteLink unexpected error:", err);
    return { error: "Server error" };
  }

  // redirect() бросает исключение — вне try/catch
  if (ok) redirect(ROUTES.dashboard);
  return {};
}
