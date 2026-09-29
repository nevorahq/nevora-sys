import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCALES, type Locale } from "@/shared/i18n/constants";
import { getDictionaryFor } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { PLANNER_RAW_TEXT_MAX_LENGTH } from "@/modules/planner/schemas/planner-entry.schema";
import { resolveChannelContext } from "../services/channel-context";
import { DOCUMENT_MAX_FILE_SIZE_BYTES } from "@/modules/documents/constants/document.constants";
import {
  captureChannelFile,
  captureChannelText,
  findChannelCapture,
  processChannelCapture,
  processChannelFileCapture,
  type ChannelFileOutcome,
} from "../services/channel-intake";
import { consumeLinkCode, findActiveIntegration, revokeIntegrationByExternal } from "../services/link-codes";
import type { ChannelIntegration } from "../types";
import type { PlannerEntry } from "@/modules/planner/types/planner.types";
import { hasMedia, parseTelegramCommand, pickAttachment, pickVoice, type TelegramUpdate } from "./telegram-update";
import { TRANSCRIPTION_MAX_BYTES, VOICE_MAX_SECONDS, type TranscriptionResult } from "../voice/transcribe-voice";
import type { CurrentContext } from "@/lib/context/current-context";
import type { TelegramDownload } from "./telegram-api";

export interface TelegramHandlerDeps {
  /** Service-role client: a webhook has no user session. */
  supabase: SupabaseClient;
  send: (chatId: string, text: string) => Promise<boolean>;
  /** Fetch a file the user sent (Bot API getFile + download), capped at `maxBytes`. */
  download: (fileId: string, maxBytes: number) => Promise<TelegramDownload>;
  /** Public app origin, for the Inbox link in replies. */
  appUrl: string;
  /**
   * Speech-to-text for voice messages; null when not configured (voice is then
   * declined). `reserve` records the paid call in the AI quota first.
   */
  transcriber: {
    reserve: (ctx: CurrentContext, durationSeconds: number | null) => Promise<boolean>;
    transcribe: (audio: { bytes: ArrayBuffer; fileName: string; mimeType: string }) => Promise<TranscriptionResult>;
  } | null;
}

export interface TelegramHandleResult {
  action:
    | "ignored"
    | "linked"
    | "link_rejected"
    | "welcome"
    | "stopped"
    | "not_linked"
    | "help"
    | "media_not_supported"
    | "media_too_large"
    | "media_rejected"
    | "voice_rejected"
    | "context_denied"
    | "too_long"
    | "captured"
    | "duplicate";
  /**
   * Work to run after Telegram has been acknowledged — the AI step and the
   * reply that reports it. The capture itself is already durable by then.
   */
  after?: () => Promise<void>;
}

/**
 * Telegram adapter (ADR 002, step 2). Private chats only; the bot never reads
 * group conversations. Commands link and unlink the account; any other text is
 * captured into the linked user's Inbox through the shared channel intake.
 *
 * Throws only when the capture could not be stored — the route then answers
 * 500 so Telegram redelivers, and the per-message key keeps it to one capture.
 */
export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: TelegramHandlerDeps,
): Promise<TelegramHandleResult> {
  const message = update.message;
  if (!message || message.chat.type !== "private" || !message.from || message.from.is_bot) {
    return { action: "ignored" };
  }

  const chatId = String(message.chat.id);
  const sender = { userId: String(message.from.id), chatId, username: message.from.username ?? null };
  const senderLocale = localeFromLanguageCode(message.from.language_code);
  const reply = (locale: Locale, pick: (bot: BotCopy) => string) => deps.send(chatId, pick(botCopy(locale)));

  const text = message.text?.trim() ?? "";
  const command = text ? parseTelegramCommand(text) : null;

  if (command?.kind === "start") {
    if (!command.code) {
      const integration = await findActiveIntegration(deps.supabase, "telegram", sender.userId);
      if (integration) {
        await reply(await userLocale(deps.supabase, integration, senderLocale), (bot) => bot.help);
        return { action: "help" };
      }
      await reply(senderLocale, (bot) => bot.welcome);
      return { action: "welcome" };
    }

    const linked = await consumeLinkCode(deps.supabase, "telegram", command.code, sender);
    if (!linked.ok) {
      await reply(senderLocale, (bot) => (linked.reason === "invalid" ? bot.invalidCode : bot.linkFailed));
      return { action: "link_rejected" };
    }
    const [locale, orgName] = await Promise.all([
      userLocale(deps.supabase, linked.integration, senderLocale),
      organizationName(deps.supabase, linked.integration.organization_id),
    ]);
    await reply(locale, (bot) => bot.linked.replace("{org}", orgName));
    return { action: "linked" };
  }

  if (command?.kind === "stop") {
    const revoked = await revokeIntegrationByExternal(deps.supabase, "telegram", sender.userId);
    await reply(senderLocale, (bot) => (revoked ? bot.stopped : bot.notConnected));
    return { action: "stopped" };
  }

  const integration = await findActiveIntegration(deps.supabase, "telegram", sender.userId);
  if (!integration) {
    await reply(senderLocale, (bot) => bot.notLinked);
    return { action: "not_linked" };
  }
  const locale = await userLocale(deps.supabase, integration, senderLocale);
  const inboxUrl = `${deps.appUrl}${ROUTES.inbox}?tab=review`;

  const attachment = pickAttachment(message);
  const voice = pickVoice(message);
  if (voice && !deps.transcriber) {
    await reply(locale, (bot) => bot.voiceUnavailable);
    return { action: "media_not_supported" };
  }
  if (hasMedia(message) && !attachment && !voice) {
    await reply(locale, (bot) => bot.mediaUnsupported);
    return { action: "media_not_supported" };
  }
  if (!attachment && !voice && (!text || command)) {
    await reply(locale, (bot) => bot.help);
    return { action: "help" };
  }

  const context = await resolveChannelContext(deps.supabase, integration);
  if (!context.ok) {
    await reply(locale, (bot) =>
      context.reason === "not_member" ? bot.notMember : context.reason === "read_only" ? bot.readOnly : bot.forbidden,
    );
    return { action: "context_denied" };
  }
  const ctx = context.ctx;
  const messageKey = `${chatId}:${message.message_id}`;

  if (voice && deps.transcriber) {
    const tooLong = () => reply(locale, (bot) => bot.voiceTooLong.replace("{max}", String(VOICE_MAX_SECONDS / 60)));
    if ((voice.durationSeconds ?? 0) > VOICE_MAX_SECONDS || (voice.size ?? 0) > TRANSCRIPTION_MAX_BYTES) {
      await tooLong();
      return { action: "voice_rejected" };
    }

    // A redelivery must not pay for a second transcription.
    const existing = await findChannelCapture(deps.supabase, ctx, "telegram", messageKey);
    if (existing) {
      return existing.status === "captured"
        ? { action: "duplicate", after: () => replyWithDraft(deps, ctx, locale, existing, null, inboxUrl, reply) }
        : { action: "duplicate" };
    }

    const downloaded = await deps.download(voice.fileId, TRANSCRIPTION_MAX_BYTES);
    if (!downloaded.ok) {
      if (downloaded.reason === "too_large") {
        await tooLong();
        return { action: "voice_rejected" };
      }
      throw new Error("Telegram voice message could not be downloaded.");
    }

    if (!(await deps.transcriber.reserve(ctx, voice.durationSeconds))) {
      await reply(locale, (bot) => bot.aiLimit);
      return { action: "voice_rejected" };
    }
    const transcript = await deps.transcriber.transcribe({ bytes: downloaded.bytes, fileName: voice.fileName, mimeType: voice.mimeType });
    if (!transcript.ok) {
      // Answered, not retried: a redelivery would pay for the call again.
      await reply(locale, (bot) => (transcript.reason === "empty" ? bot.voiceEmpty : bot.voiceFailed));
      return { action: "voice_rejected" };
    }

    const heard = transcript.text.slice(0, PLANNER_RAW_TEXT_MAX_LENGTH);
    const stored = await captureChannelText(deps.supabase, ctx, { channel: "telegram", messageKey, text: heard, entryType: "voice" });
    if (!stored.ok) {
      if (stored.code === "failed") throw new Error("Telegram voice capture could not be stored.");
      await reply(locale, (bot) => bot.voiceEmpty);
      return { action: "voice_rejected" };
    }
    const entry = stored.entry;
    return {
      action: stored.reused ? "duplicate" : "captured",
      after: () => replyWithDraft(deps, ctx, locale, entry, heard, inboxUrl, reply),
    };
  }

  if (attachment) {
    const tooLarge = () => reply(locale, (bot) => bot.mediaTooLarge.replace("{max}", String(DOCUMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024))));
    if (attachment.size != null && attachment.size > DOCUMENT_MAX_FILE_SIZE_BYTES) {
      await tooLarge();
      return { action: "media_too_large" };
    }
    const downloaded = await deps.download(attachment.fileId, DOCUMENT_MAX_FILE_SIZE_BYTES);
    if (!downloaded.ok) {
      if (downloaded.reason === "too_large") {
        await tooLarge();
        return { action: "media_too_large" };
      }
      // Transient: answer 500 so Telegram redelivers the message.
      throw new Error("Telegram file could not be downloaded.");
    }

    const file = new File([downloaded.bytes], attachment.fileName, attachment.mimeType ? { type: attachment.mimeType } : {});
    const stored = await captureChannelFile(deps.supabase, ctx, {
      channel: "telegram",
      messageKey,
      file,
      note: message.caption?.trim() || null,
      kind: attachment.kind,
    });
    if (!stored.ok) {
      if (stored.code === "failed") throw new Error("Telegram file capture could not be stored.");
      await reply(locale, (bot) =>
        stored.code === "invalid_file" ? bot.mediaInvalid : stored.code === "plan_limit" ? bot.planLimit : bot.forbidden,
      );
      return { action: "media_rejected" };
    }
    // A redelivery of a stored file: the first delivery reads it and replies.
    if (stored.reused) return { action: "duplicate" };
    const extractionId = stored.extractionId;
    if (!extractionId) {
      await reply(locale, (bot) => bot.mediaSaved.replace("{url}", inboxUrl));
      return { action: "captured" };
    }

    return {
      action: "captured",
      after: async () => {
        const outcome = await processChannelFileCapture(deps.supabase, ctx, {
          documentId: stored.documentId,
          entryId: stored.entryId,
          extractionId,
        });
        await reply(locale, (bot) => fileOutcomeText(bot, outcome, locale, inboxUrl));
      },
    };
  }

  const captured = await captureChannelText(deps.supabase, ctx, {
    channel: "telegram",
    messageKey,
    text,
  });
  if (!captured.ok) {
    if (captured.code === "too_long") {
      await reply(locale, (bot) => bot.tooLong.replace("{max}", String(PLANNER_RAW_TEXT_MAX_LENGTH)));
      return { action: "too_long" };
    }
    if (captured.code === "empty") {
      await reply(locale, (bot) => bot.help);
      return { action: "help" };
    }
    throw new Error("Telegram capture could not be stored.");
  }

  // A redelivery of a stored message: the first delivery replies. Only a capture
  // that never got its AI step (the process died after storing it) is resumed.
  if (captured.reused && captured.entry.status !== "captured") return { action: "duplicate" };

  const entry = captured.entry;
  return {
    action: captured.reused ? "duplicate" : "captured",
    after: () => replyWithDraft(deps, ctx, locale, entry, null, inboxUrl, reply),
  };
}

type BotCopy = ReturnType<typeof getDictionaryFor>["channels"]["telegram"]["bot"];

/** Longest transcript quoted back in a reply; the full text is in the Inbox. */
const HEARD_PREVIEW_CHARS = 300;

/**
 * Run intent detection on a stored capture and answer with the draft it
 * produced — preceded, for a voice note, by what was heard, so the sender can
 * tell a mis-transcription at a glance.
 */
async function replyWithDraft(
  deps: TelegramHandlerDeps,
  ctx: CurrentContext,
  locale: Locale,
  entry: PlannerEntry,
  heard: string | null,
  inboxUrl: string,
  reply: (locale: Locale, pick: (bot: BotCopy) => string) => Promise<boolean>,
): Promise<void> {
  const processed = await processChannelCapture(deps.supabase, ctx, entry);
  const draft = processed.suggestions[0];
  await reply(locale, (bot) => {
    const result = draft
      ? bot.captured
          .replace("{title}", draft.title)
          .replace("{url}", `${deps.appUrl}${ROUTES.inbox}?tab=review&suggestion=${draft.id}`)
      : bot.capturedNoDraft.replace("{url}", inboxUrl);
    if (!heard) return result;
    const preview = heard.length > HEARD_PREVIEW_CHARS ? `${heard.slice(0, HEARD_PREVIEW_CHARS).trimEnd()}…` : heard;
    return `${bot.voiceHeard.replace("{text}", preview)}\n\n${result}`;
  });
}

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ru: "ru-RU", ro: "ro-RO" };

function fileOutcomeText(bot: BotCopy, outcome: ChannelFileOutcome, locale: Locale, inboxUrl: string): string {
  switch (outcome.kind) {
    case "receipt":
      return bot.mediaReceipt
        .replace("{vendor}", outcome.vendor?.trim() || bot.unknownVendor)
        .replace("{amount}", formatAmount(outcome.amount, outcome.currency, locale))
        .replace("{url}", inboxUrl);
    case "tasks":
      return bot.mediaTasks.replace("{count}", String(outcome.count)).replace("{url}", inboxUrl);
    case "failed":
      return bot.mediaFailed.replace("{url}", inboxUrl);
    default:
      return bot.mediaSaved.replace("{url}", inboxUrl);
  }
}

function formatAmount(amount: number | null, currency: string | null, locale: Locale): string {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency: currency ?? "EUR" }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

function botCopy(locale: Locale): BotCopy {
  return getDictionaryFor(locale).channels.telegram.bot;
}

/** Telegram's IETF tag (`ru`, `ro`, `en-US`, …) → an app locale; English otherwise. */
export function localeFromLanguageCode(code: string | undefined): Locale {
  const base = code?.toLowerCase().split("-")[0];
  return LOCALES.find((locale) => locale === base) ?? "en";
}

/** The linked user's chosen app language, else the Telegram client's. */
async function userLocale(supabase: SupabaseClient, integration: ChannelIntegration, fallback: Locale): Promise<Locale> {
  const { data } = await supabase.from("profiles").select("language").eq("id", integration.user_id).maybeSingle();
  const language = (data as { language?: string } | null)?.language;
  return LOCALES.find((locale) => locale === language) ?? fallback;
}

async function organizationName(supabase: SupabaseClient, organizationId: string): Promise<string> {
  const { data } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  return ((data as { name?: string } | null)?.name ?? "Nevora").trim() || "Nevora";
}
