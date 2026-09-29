"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { ROUTES } from "@/shared/config/routes";
import { getEmailChannelConfig } from "../email/resend-inbound";
import { formatInboxAddress, generateInboxToken } from "../email/inbound-address";

/**
 * Settings → Integrations → Email. The signed-in user gets (or rotates) THEIR
 * OWN forwarding address. Integrations are written by the server only
 * (migration 121 grants users no INSERT), so the row is created with the
 * service-role client — for exactly the session's user, organization and
 * workspace, never anything from the client.
 */

export type EmailAddressResult =
  | { ok: true; address: string }
  | { ok: false; code: "not_configured" | "forbidden" | "failed" };

export async function issueEmailForwardingAddressAction(): Promise<EmailAddressResult> {
  const config = getEmailChannelConfig();
  const service = getServiceRoleClient();
  if (!config || !service) return { ok: false, code: "not_configured" };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "planner.entry.create", intent: "write" });
  } catch (error) {
    if (isAccessError(error)) return { ok: false, code: "forbidden" };
    throw error;
  }

  // One active address per user: a new one retires the old immediately.
  const now = new Date().toISOString();
  const { error: revokeError } = await service
    .from("channel_integrations")
    .update({ status: "revoked", revoked_at: now })
    .eq("organization_id", ctx.org.id)
    .eq("user_id", ctx.user.id)
    .eq("channel", "email")
    .eq("status", "active");
  if (revokeError) return { ok: false, code: "failed" };

  const token = generateInboxToken();
  const { error } = await service.from("channel_integrations").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    user_id: ctx.user.id,
    channel: "email",
    external_user_id: token,
    status: "active",
  });
  if (error) {
    console.error("[issueEmailForwardingAddressAction] insert failed:", error.message);
    return { ok: false, code: "failed" };
  }

  revalidatePath(ROUTES.settingsIntegrations);
  return { ok: true, address: formatInboxAddress(token, config.domain) };
}

export async function disconnectEmailForwardingAction(): Promise<{ ok: boolean }> {
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
    .eq("channel", "email")
    .eq("status", "active");
  if (error) {
    console.error("[disconnectEmailForwardingAction] failed:", error.message);
    return { ok: false };
  }
  revalidatePath(ROUTES.settingsIntegrations);
  return { ok: true };
}
