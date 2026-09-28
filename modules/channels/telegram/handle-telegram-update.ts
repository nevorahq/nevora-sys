import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCALES, type Locale } from "@/shared/i18n/constants";
import { getDictionaryFor } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { PLANNER_RAW_TEXT_MAX_LENGTH } from "@/modules/planner/schemas/planner-entry.schema";
import { resolveChannelContext } from "../services/channel-context";
import { captureChannelText, processChannelCapture } from "../services/channel-intake";
import { consumeLinkCode, findActiveIntegration, revokeIntegrationByExternal } from "../services/link-codes";
import type { ChannelIntegration } from "../types";
import { hasMedia, parseTelegramCommand, type TelegramUpdate } from "./telegram-update";

export interface TelegramHandlerDeps {
  /** Service-role client: a webhook has no user session. */
  supabase: SupabaseClient;
  send: (chatId: string, text: string) => Promise<boolean>;
  /** Public app origin, for the Inbox link in replies. */
  appUrl: string;
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

  if (hasMedia(message)) {
    await reply(locale, (bot) => bot.mediaNotYet.replace("{url}", inboxUrl));
    return { action: "media_not_supported" };
  }
  if (!text || command) {
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

  const captured = await captureChannelText(deps.supabase, ctx, {
    channel: "telegram",
    messageKey: `${chatId}:${message.message_id}`,
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
    after: async () => {
      const processed = await processChannelCapture(deps.supabase, ctx, entry);
      const draft = processed.suggestions[0];
      await reply(locale, (bot) =>
        draft
          ? bot.captured
              .replace("{title}", draft.title)
              .replace("{url}", `${deps.appUrl}${ROUTES.inbox}?tab=review&suggestion=${draft.id}`)
          : bot.capturedNoDraft.replace("{url}", inboxUrl),
      );
    },
  };
}

type BotCopy = ReturnType<typeof getDictionaryFor>["channels"]["telegram"]["bot"];

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
