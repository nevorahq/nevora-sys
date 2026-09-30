import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";
import type { DigestEmail } from "./compose-digest-email";

/** Resend credentials, or null when email is not configured on this deployment. */
export function getDigestEmailConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

/** Send one digest email. Never throws; false on any provider error. */
export async function sendDigestEmail(config: { apiKey: string; from: string }, to: string, email: DigestEmail): Promise<boolean> {
  try {
    const { error } = await new Resend(config.apiKey).emails.send({
      from: config.from,
      to: [to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      // RFC 2369: where the recipient turns the digest off (Settings → Notifications).
      headers: { "List-Unsubscribe": `<${email.settingsUrl}>` },
    });
    if (error) {
      logger.warn("notification.digest.email_failed", { error: error.message });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn("notification.digest.email_threw", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/** The account's email from Auth (service role), or null. */
export async function getAccountEmail(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  return data.user?.email ?? null;
}
