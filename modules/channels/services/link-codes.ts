import "server-only";
import { createHash, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { CHANNEL_INTEGRATION_COLUMNS, type Channel, type ChannelIntegration, type ExternalSender } from "../types";

/**
 * One-time link codes (migration 121). A signed-in user issues a code in
 * Settings and sends it to the channel (Telegram: `/start <code>`); the webhook
 * consumes it and links that external account to the user.
 *
 * The code is shown once and stored only as a SHA-256 hash. It expires fast and
 * is single-use: consumption is an atomic `used_at IS NULL` claim.
 */

/** Unambiguous alphabet (no 0/O, 1/I/L) — the code may be typed by hand. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_TTL_MINUTES = 15;

export function generateLinkCode(): string {
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Case- and space-insensitive, so a code typed by hand still matches. */
export function normalizeLinkCode(input: string): string {
  return input.replace(/[\s-]+/g, "").toUpperCase();
}

export function hashLinkCode(code: string): string {
  return createHash("sha256").update(normalizeLinkCode(code)).digest("hex");
}

export async function issueLinkCode(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  channel: Channel,
): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false }> {
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000).toISOString();
  const { error } = await supabase.from("channel_link_codes").insert({
    organization_id: ctx.org.id,
    workspace_id: ctx.workspace.id,
    user_id: ctx.user.id,
    channel,
    code_hash: hashLinkCode(code),
    expires_at: expiresAt,
  });
  if (error) {
    console.error("[issueLinkCode] insert failed:", error.message);
    return { ok: false };
  }
  return { ok: true, code, expiresAt };
}

export type ConsumeLinkCodeResult =
  | { ok: true; integration: ChannelIntegration }
  | { ok: false; reason: "invalid" | "failed" };

/**
 * Claim a code and link the sender. Service-role client: the webhook has no
 * session. An external account already linked elsewhere is moved to this user,
 * and this user's previous account on the channel is revoked — one-to-one.
 */
export async function consumeLinkCode(
  supabase: SupabaseClient,
  channel: Channel,
  code: string,
  sender: ExternalSender,
): Promise<ConsumeLinkCodeResult> {
  const normalized = normalizeLinkCode(code);
  if (normalized.length !== LINK_CODE_LENGTH || ![...normalized].every((char) => ALPHABET.includes(char))) {
    return { ok: false, reason: "invalid" };
  }

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("channel_link_codes")
    .update({ used_at: now })
    .eq("code_hash", hashLinkCode(normalized))
    .eq("channel", channel)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("organization_id, workspace_id, user_id")
    .maybeSingle();
  if (claimError) {
    console.error("[consumeLinkCode] claim failed:", claimError.message);
    return { ok: false, reason: "failed" };
  }
  if (!claimed) return { ok: false, reason: "invalid" };

  const organizationId = claimed.organization_id as string;
  const userId = claimed.user_id as string;

  // Free both unique slots: this external account anywhere, and this user's
  // current account on the channel in this organization.
  const revoke = { status: "revoked", revoked_at: now };
  const [byExternal, byUser] = await Promise.all([
    supabase.from("channel_integrations").update(revoke).eq("channel", channel).eq("external_user_id", sender.userId).eq("status", "active"),
    supabase
      .from("channel_integrations")
      .update(revoke)
      .eq("channel", channel)
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);
  if (byExternal.error || byUser.error) {
    console.error("[consumeLinkCode] revoke failed:", byExternal.error?.message ?? byUser.error?.message);
    return { ok: false, reason: "failed" };
  }

  const { data: integration, error: insertError } = await supabase
    .from("channel_integrations")
    .insert({
      organization_id: organizationId,
      workspace_id: claimed.workspace_id as string | null,
      user_id: userId,
      channel,
      external_user_id: sender.userId,
      external_chat_id: sender.chatId,
      external_username: sender.username,
      status: "active",
    })
    .select(CHANNEL_INTEGRATION_COLUMNS)
    .single();
  if (insertError || !integration) {
    console.error("[consumeLinkCode] link failed:", insertError?.message);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, integration: integration as ChannelIntegration };
}

/** The active integration for an external sender, if any. */
export async function findActiveIntegration(
  supabase: SupabaseClient,
  channel: Channel,
  externalUserId: string,
): Promise<ChannelIntegration | null> {
  const { data } = await supabase
    .from("channel_integrations")
    .select(CHANNEL_INTEGRATION_COLUMNS)
    .eq("channel", channel)
    .eq("external_user_id", externalUserId)
    .eq("status", "active")
    .maybeSingle();
  return (data as ChannelIntegration | null) ?? null;
}

/** Unlink an external sender (the bot's /stop). */
export async function revokeIntegrationByExternal(
  supabase: SupabaseClient,
  channel: Channel,
  externalUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("channel_integrations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("channel", channel)
    .eq("external_user_id", externalUserId)
    .eq("status", "active")
    .select("id");
  return (data?.length ?? 0) > 0;
}
