import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { logger } from "@/lib/observability/logger";

/**
 * Speech-to-text for voice messages (ADR 002). Claude reads text, images and
 * documents but not audio, so a voice note is transcribed first by OpenAI's
 * transcription model; the transcript then takes the ordinary text capture path.
 *
 * One HTTPS call, no SDK dependency. The model reads Telegram's OGG/Opus
 * directly and detects the language itself (ru / ro / en).
 */

const ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "gpt-4o-mini-transcribe";
const TIMEOUT_MS = 30_000;
/** OpenAI's upload cap. */
export const TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;
/** Longest voice note transcribed: bounds cost and the webhook's time. */
export const VOICE_MAX_SECONDS = 5 * 60;

export interface TranscriptionConfig {
  apiKey: string;
  model: string;
}

/** Null unless OPENAI_API_KEY is set: voice messages are then declined as unsupported. */
export function getTranscriptionConfig(): TranscriptionConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_MODEL };
}

export type TranscriptionResult = { ok: true; text: string } | { ok: false; reason: "empty" | "failed" };

export async function transcribeVoice(
  config: TranscriptionConfig,
  audio: { bytes: ArrayBuffer; fileName: string; mimeType: string },
): Promise<TranscriptionResult> {
  const form = new FormData();
  form.set("model", config.model);
  form.set("response_format", "json");
  form.set("file", new File([audio.bytes], audio.fileName, { type: audio.mimeType }));

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn("voice.transcription.failed", { status: response.status });
      return { ok: false, reason: "failed" };
    }
    const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    return text ? { ok: true, text } : { ok: false, reason: "empty" };
  } catch (error) {
    logger.warn("voice.transcription.threw", { error: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "failed" };
  }
}

/**
 * Record one transcription in the shared monthly AI quota BEFORE calling the
 * model (migration 124). The start_limit_ai_requests trigger rejects the insert
 * once the quota is used up — that rejection is the limit. False means "do not
 * transcribe": unlike intent detection there is no model-free fallback for audio.
 */
export async function reserveVoiceTranscription(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  durationSeconds: number | null,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("ai_requests").insert({
    organization_id: ctx.org.id,
    user_id: ctx.user.id,
    action_type: "voice_transcription",
    status: "completed",
    completed_at: now,
    metadata: { duration_seconds: durationSeconds },
  });
  if (!error) return true;
  logger.warn("voice.transcription.quota_denied", { organizationId: ctx.org.id, code: error.code, message: error.message });
  return false;
}
