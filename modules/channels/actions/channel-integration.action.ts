"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppAccess, isAccessError } from "@/lib/security";
import { ROUTES } from "@/shared/config/routes";
import { getTelegramConfig } from "../telegram/telegram-api";
import { issueLinkCode, LINK_CODE_TTL_MINUTES } from "../services/link-codes";

/**
 * Settings → Integrations. A user links THEIR OWN Telegram account: the code is
 * issued for the signed-in user and consumed by the bot. No admin permission is
 * involved — the capture lands in that user's private Inbox.
 */

export type IssueTelegramCodeResult =
  | { ok: true; code: string; deepLink: string | null; ttlMinutes: number }
  | { ok: false; code: "not_configured" | "forbidden" | "failed" };

export async function issueTelegramLinkCodeAction(): Promise<IssueTelegramCodeResult> {
  const config = getTelegramConfig();
  if (!config) return { ok: false, code: "not_configured" };

  let ctx: Awaited<ReturnType<typeof requireAppAccess>>;
  try {
    ctx = await requireAppAccess({ permission: "planner.entry.create", intent: "write" });
  } catch (error) {
    if (isAccessError(error)) return { ok: false, code: "forbidden" };
    throw error;
  }

  const issued = await issueLinkCode(await createClient(), ctx, "telegram");
  if (!issued.ok) return { ok: false, code: "failed" };
  return {
    ok: true,
    code: issued.code,
    deepLink: config.botUsername ? `https://t.me/${config.botUsername}?start=${issued.code}` : null,
    ttlMinutes: LINK_CODE_TTL_MINUTES,
  };
}

export async function disconnectTelegramAction(): Promise<{ ok: boolean }> {
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
    .eq("channel", "telegram")
    .eq("status", "active");
  if (error) {
    console.error("[disconnectTelegramAction] failed:", error.message);
    return { ok: false };
  }
  revalidatePath(ROUTES.settingsIntegrations);
  return { ok: true };
}
