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

/**
 * - `empty`: the model ran and heard no speech (billed by the provider).
 * - `unavailable`: the provider refused the account — no credits, a revoked or
 *   wrong key. Retrying will not help until someone fixes the account.
 * - `failed`: transient (rate limit, provider error, timeout); worth a retry.
 * Neither `unavailable` nor `failed` is billed by the provider.
 */
export type TranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty" | "unavailable" | "failed" };

/** OpenAI error codes meaning "the account cannot be served", not "try again". */
const ACCOUNT_ERROR_CODES = new Set(["insufficient_quota", "credit_balance_exhausted", "billing_hard_limit_reached", "invalid_api_key", "account_deactivated"]);

/** Classify a failed response; exported for tests. */
export function classifyTranscriptionError(status: number, error: { type?: string; code?: string } | null): "unavailable" | "failed" {
  if (status === 401 || status === 403) return "unavailable";
  if (error?.type === "insufficient_quota" || (error?.code && ACCOUNT_ERROR_CODES.has(error.code))) return "unavailable";
  return "failed";
}

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
      const body = (await response.json().catch(() => null)) as { error?: { type?: string; code?: string } } | null;
      const error = body?.error ?? null;
      const reason = classifyTranscriptionError(response.status, error);
      // Type and code only — never the message, which may echo account details.
      logger.warn("voice.transcription.failed", { status: response.status, type: error?.type ?? null, code: error?.code ?? null, reason });
      return { ok: false, reason };
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
 * once the quota is used up — that rejection is the limit. Returns the ledger
 * row id, or null for "do not transcribe": unlike intent detection there is no
 * model-free fallback for audio.
 */
export async function reserveVoiceTranscription(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  durationSeconds: number | null,
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ai_requests")
    .insert({
      organization_id: ctx.org.id,
      user_id: ctx.user.id,
      action_type: "voice_transcription",
      status: "completed",
      completed_at: now,
      metadata: { duration_seconds: durationSeconds },
    })
    .select("id")
    .single();
  if (!error && data) return data.id as string;
  logger.warn("voice.transcription.quota_denied", { organizationId: ctx.org.id, code: error?.code, message: error?.message });
  return null;
}

/**
 * Give the reserved unit back when the provider did no work (`unavailable` or
 * `failed` — neither is billed). The quota counts every ai_requests row of the
 * month regardless of status (059), so the row is removed, not re-labelled.
 * Best-effort: a failed refund costs one unit, never the capture.
 */
export async function releaseVoiceTranscription(
  supabase: SupabaseClient,
  ctx: CurrentContext,
  requestId: string,
): Promise<void> {
  const { error } = await supabase
    .from("ai_requests")
    .delete()
    .eq("id", requestId)
    .eq("organization_id", ctx.org.id)
    .eq("action_type", "voice_transcription");
  if (error) logger.warn("voice.transcription.release_failed", { organizationId: ctx.org.id, code: error.code });
}
