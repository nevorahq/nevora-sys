"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { acceptInviteLinkSchema } from "../schemas/member.schemas";
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
  await requireUser();

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
      if (error.message.includes("trial_expired")) {
        return { error: "This organization’s trial has ended and cannot accept new members." };
      }
      if (error.message.includes("invite_invalid")) {
        return { error: "This invite link is invalid or has expired." };
      }
      if (error.message.includes("member_limit_reached")) {
        return { error: "This organization has reached its member limit." };
      }
      console.error("acceptInviteLink RPC error:", error);
      return { error: "Failed to accept invite" };
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
