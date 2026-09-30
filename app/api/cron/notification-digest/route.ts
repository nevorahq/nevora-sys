import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { getTelegramConfig, sendTelegramMessage } from "@/modules/channels/telegram/telegram-api";
import { sendTelegramDigests } from "@/modules/notifications/digest/send-telegram-digests";

/**
 * Daily Telegram digest (ADR 003, step 1). Runs hourly; each linked user gets at
 * most one summary a day, at their own digest hour. Scheduled by the Netlify
 * function of the same basename.
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

  const telegram = getTelegramConfig();
  if (!telegram) return NextResponse.json({ ok: true, skipped: "telegram_unconfigured" });
  const supabase = getServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: true, skipped: "service_role_unconfigured" });

  try {
    const result = await sendTelegramDigests({
      supabase,
      now: new Date(),
      appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, ""),
      send: (chatId, text, button) => sendTelegramMessage(telegram.token, chatId, text, button),
    });
    logger.info("cron.notification_digest", { ...result });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    logger.error("cron.notification_digest.threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Digest sweep failed." }, { status: 500 });
  }
}
