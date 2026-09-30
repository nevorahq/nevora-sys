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

export interface TelegramLinkButton {
  label: string;
  /** Must be https — Telegram rejects other schemes on inline buttons. */
  url: string;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  button?: TelegramLinkButton,
): Promise<boolean> {
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
        ...(button ? { reply_markup: { inline_keyboard: [[{ text: button.label, url: button.url }]] } } : {}),
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

export type TelegramDownload =
  | { ok: true; bytes: ArrayBuffer }
  | { ok: false; reason: "too_large" | "failed" };

/**
 * Download a file the user sent to the bot (getFile → file endpoint). `maxBytes`
 * is checked against the size Telegram reports and again against the bytes, so
 * an oversized file is never buffered whole.
 */
export async function downloadTelegramFile(token: string, fileId: string, maxBytes: number): Promise<TelegramDownload> {
  try {
    const meta = await fetch(`${API_BASE}/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await meta.json().catch(() => null)) as
      | { ok?: boolean; result?: { file_path?: string; file_size?: number } }
      | null;
    const filePath = body?.result?.file_path;
    if (!meta.ok || !body?.ok || !filePath) {
      logger.warn("telegram.get_file.failed", { status: meta.status });
      return { ok: false, reason: "failed" };
    }
    if ((body.result?.file_size ?? 0) > maxBytes) return { ok: false, reason: "too_large" };

    const file = await fetch(`${API_BASE}/file/bot${token}/${filePath}`, { signal: AbortSignal.timeout(TIMEOUT_MS * 2) });
    if (!file.ok) {
      logger.warn("telegram.download.failed", { status: file.status });
      return { ok: false, reason: "failed" };
    }
    const declared = Number(file.headers.get("content-length") ?? 0);
    if (declared > maxBytes) return { ok: false, reason: "too_large" };
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, bytes };
  } catch (error) {
    logger.warn("telegram.download.threw", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "failed" };
  }
}
