import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/observability/logger";
import { downloadTelegramFile, getTelegramConfig, sendTelegramMessage } from "@/modules/channels/telegram/telegram-api";
import { handleTelegramUpdate } from "@/modules/channels/telegram/handle-telegram-update";
import { telegramUpdateSchema } from "@/modules/channels/telegram/telegram-update";
import {
  getTranscriptionConfig,
  reserveVoiceTranscription,
  transcribeVoice,
} from "@/modules/channels/voice/transcribe-voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Telegram updates are small; anything larger is not a message we handle. */
const MAX_BODY_BYTES = 256 * 1024;
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * Telegram Bot API webhook (ADR 002, step 2).
 *
 * Machine route (listed in MACHINE_ROUTES): there is no session. It
 * authenticates itself with the secret token Telegram echoes on every call
 * (set by `setWebhook`) and fails closed: 503 when the bot is not configured,
 * 401 on a wrong secret.
 *
 * The capture is stored BEFORE answering 200, so a failure answers 500 and
 * Telegram redelivers (the per-message key keeps that to one capture). The AI
 * step and the reply that reports it run after the response.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = getTelegramConfig();
  const supabase = getServiceRoleClient();
  if (!config || !supabase) {
    logger.error("telegram.webhook.misconfigured", { bot: Boolean(config), serviceRole: Boolean(supabase) });
    return NextResponse.json({ error: "Telegram is not configured." }, { status: 503 });
  }

  if (!secretMatches(request.headers.get(SECRET_HEADER), config.webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text().catch(() => null);
  if (raw === null || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    // Acknowledge: a malformed or oversized update will never parse, and a
    // non-2xx would make Telegram retry it forever.
    return NextResponse.json({ ok: true });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const parsed = telegramUpdateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: true });

  const transcription = getTranscriptionConfig();
  try {
    const result = await handleTelegramUpdate(parsed.data, {
      supabase,
      send: (chatId, text) => sendTelegramMessage(config.token, chatId, text),
      download: (fileId, maxBytes) => downloadTelegramFile(config.token, fileId, maxBytes),
      transcriber: transcription
        ? {
            reserve: (ctx, durationSeconds) => reserveVoiceTranscription(supabase, ctx, durationSeconds),
            transcribe: (audio) => transcribeVoice(transcription, audio),
          }
        : null,
      appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, ""),
    });
    if (result.after) {
      const work = result.after;
      after(async () => {
        try {
          await work();
        } catch (error) {
          logger.error("telegram.webhook.after_failed", {
            updateId: parsed.data.update_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
    logger.info("telegram.webhook.handled", { updateId: parsed.data.update_id, action: result.action });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("telegram.webhook.failed", {
      updateId: parsed.data.update_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not process the update." }, { status: 500 });
  }
}

function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
