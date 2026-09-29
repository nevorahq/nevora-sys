"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { ROUTES } from "@/shared/config/routes";

/**
 * Settings → Integrations → Slack. Connecting is the OAuth round trip
 * (`/api/channels/slack/connect`); this only disconnects the user's own account.
 * The Slack app stays installed in the workspace for their teammates — removing
 * it is the Slack workspace admin's call.
 */
export async function disconnectSlackAction(): Promise<{ ok: boolean }> {
  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ intent: "read" });
  } catch (error) {
    if (isAccessError(error)) return { ok: false };
    throw error;
  }
  // RLS allows exactly this: the user's own active row → revoked.
  const { error } = await (await createClient())
    .from("channel_integrations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("organization_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .eq("channel", "slack")
    .eq("status", "active");
  if (error) {
    console.error("[disconnectSlackAction] failed:", error.message);
    return { ok: false };
  }
  revalidatePath(ROUTES.settingsIntegrations);
  return { ok: true };
}
