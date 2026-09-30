import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { getTelegramConfig, sendTelegramMessage } from "@/modules/channels/telegram/telegram-api";
import { sendEmailDigests, sendTelegramDigests, type DigestSweepResult } from "@/modules/notifications/digest/send-digests";
import { getAccountEmail, getDigestEmailConfig, sendDigestEmail } from "@/modules/notifications/digest/digest-email-sender";

/**
 * Daily digest (ADR 003). Runs hourly; each member gets at most one summary a
 * day at their own digest hour — in Telegram when linked (step 1), otherwise by
 * email (step 2). Scheduled by the Netlify function of the same basename.
 *
 * Fail-closed like the other crons: `CRON_SECRET` must be set and presented as
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("cron.notification_digest.misconfigured", { reason: "CRON_SECRET not set" });
    return NextResponse.json({ error: "Cron is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: true, skipped: "service_role_unconfigured" });
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const now = new Date();

  try {
    const telegramConfig = getTelegramConfig();
    const emailConfig = getDigestEmailConfig();
    const telegram: DigestSweepResult | "unconfigured" = telegramConfig
      ? await sendTelegramDigests({
          supabase,
          now,
          appUrl,
          send: (chatId, text, button) => sendTelegramMessage(telegramConfig.token, chatId, text, button),
        })
      : "unconfigured";
    const email: DigestSweepResult | "unconfigured" = emailConfig
      ? await sendEmailDigests({
          supabase,
          now,
          appUrl,
          getEmail: (userId) => getAccountEmail(supabase, userId),
          send: (to, message) => sendDigestEmail(emailConfig, to, message),
        })
      : "unconfigured";
    const ok = [telegram, email].every((result) => result === "unconfigured" || result.ok);
    logger.info("cron.notification_digest", { ok, telegram, email });
    return NextResponse.json({ ok, telegram, email }, { status: ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.notification_digest.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Digest sweep failed." }, { status: 500 });
  }
}
