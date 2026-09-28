import "server-only";
import { logger } from "@/lib/observability/logger";

/**
 * Minimal Telegram Bot API client — only what the capture adapter needs.
 * Never throws: a failed reply must not fail the capture it reports on.
 */

const API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 8_000;

export interface TelegramConfig {
  token: string;
  webhookSecret: string;
  /** Bot @username without the @, for the deep link in Settings. */
  botUsername: string | null;
}

/** Null unless both the bot token and the webhook secret are configured. */
export function getTelegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !webhookSecret) return null;
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return { token, webhookSecret, botUsername: username || null };
}

export async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        // Plain text on purpose: user content is echoed back and must never be
        // parsed as Markdown/HTML.
        text: text.slice(0, 4096),
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn("telegram.send_message.failed", { status: response.status });
      return false;
    }
    return true;
  } catch (error) {
    logger.warn("telegram.send_message.threw", { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
