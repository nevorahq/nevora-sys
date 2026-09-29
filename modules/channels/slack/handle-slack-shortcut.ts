import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/shared/i18n/constants";
import { getDictionaryFor } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { PLANNER_RAW_TEXT_MAX_LENGTH } from "@/modules/planner/schemas/planner-entry.schema";
import { resolveChannelContext } from "../services/channel-context";
import { captureChannelText, processChannelCapture } from "../services/channel-intake";
import { findActiveIntegration } from "../services/link-codes";
import { resolveUserLocale } from "../services/user-locale";
import type { ChannelIntegration } from "../types";
import { SLACK_SHORTCUT_CALLBACK_ID, slackExternalUserId } from "./slack-api";
import { shortcutScope, slackMessageText, type SlackMessageShortcut } from "./slack-payload";

export interface SlackHandlerDeps {
  /** Service-role client: an interaction request has no user session. */
  supabase: SupabaseClient;
  /** Ephemeral reply to the user who ran the shortcut (the payload's response_url). */
  respond: (text: string) => Promise<boolean>;
  /** Public app origin, for the links in replies. */
  appUrl: string;
}

export interface SlackHandleResult {
  action:
    | "ignored"
    | "not_linked"
    | "empty"
    | "media_not_supported"
    | "context_denied"
    | "too_long"
    | "failed"
    | "captured"
    | "duplicate";
  /**
   * Work to run after Slack has been acknowledged (it allows three seconds):
   * every reply, and for a new capture the AI step it reports on. The capture
   * itself is already durable by then.
   */
  after?: () => Promise<void>;
}

/**
 * Slack adapter (ADR 002, step 3). The only entry point is the "Send to Nevora"
 * message shortcut: the user picks one message, and only that message is read —
 * the app never listens to channels. The message text is captured into the
 * linked user's Inbox through the shared channel intake.
 *
 * Slack does not redeliver interactions, so a capture that cannot be stored is
 * answered ("try again") rather than thrown; the per-message key keeps a second
 * attempt of the same message to one capture.
 */
export async function handleSlackShortcut(payload: SlackMessageShortcut, deps: SlackHandlerDeps): Promise<SlackHandleResult> {
  if (payload.callback_id !== SLACK_SHORTCUT_CALLBACK_ID) return { action: "ignored" };

  const later = (locale: Locale, pick: (bot: BotCopy) => string) => async () => {
    await deps.respond(pick(botCopy(locale)));
  };
  const settingsUrl = `${deps.appUrl}${ROUTES.settingsIntegrations}`;
  const inboxUrl = `${deps.appUrl}${ROUTES.inbox}?tab=review`;

  const integration = await findSlackIntegration(deps.supabase, payload);
  if (!integration) {
    // An unknown Slack user: nothing tells us their language yet.
    return { action: "not_linked", after: later("en", (bot) => bot.notLinked.replace("{url}", settingsUrl)) };
  }
  const locale = await resolveUserLocale(deps.supabase, integration.user_id, "en");

  const text = slackMessageText(payload.message);
  const hasFiles = (payload.message.files?.length ?? 0) > 0;
  if (!text) {
    return hasFiles
      ? { action: "media_not_supported", after: later(locale, (bot) => bot.filesNotSupported.replace("{url}", inboxUrl)) }
      : { action: "empty", after: later(locale, (bot) => bot.empty) };
  }

  const context = await resolveChannelContext(deps.supabase, integration);
  if (!context.ok) {
    return {
      action: "context_denied",
      after: later(locale, (bot) =>
        context.reason === "not_member" ? bot.notMember : context.reason === "read_only" ? bot.readOnly : bot.forbidden,
      ),
    };
  }
  const ctx = context.ctx;

  // Per Slack user: two teammates sending the same message each get a capture;
  // one user sending it twice gets one.
  const messageKey = `${payload.user.id}:${payload.channel.id}:${payload.message.ts}`;
  const captured = await captureChannelText(deps.supabase, ctx, { channel: "slack", messageKey, text });
  if (!captured.ok) {
    if (captured.code === "too_long") {
      return {
        action: "too_long",
        after: later(locale, (bot) => bot.tooLong.replace("{max}", String(PLANNER_RAW_TEXT_MAX_LENGTH))),
      };
    }
    if (captured.code === "empty") return { action: "empty", after: later(locale, (bot) => bot.empty) };
    return { action: "failed", after: later(locale, (bot) => bot.failed) };
  }

  // Sent again after the first one was processed: point at the existing draft.
  // A capture that never got its AI step (the process died) is resumed below.
  if (captured.reused && captured.entry.status !== "captured") {
    return { action: "duplicate", after: later(locale, (bot) => bot.duplicate.replace("{url}", inboxUrl)) };
  }

  const entry = captured.entry;
  return {
    action: captured.reused ? "duplicate" : "captured",
    after: async () => {
      const processed = await processChannelCapture(deps.supabase, ctx, entry);
      const draft = processed.suggestions[0];
      const bot = botCopy(locale);
      const result = draft
        ? bot.captured
            .replace("{title}", draft.title)
            .replace("{url}", `${deps.appUrl}${ROUTES.inbox}?tab=review&suggestion=${draft.id}`)
        : bot.capturedNoDraft.replace("{url}", inboxUrl);
      await deps.respond(hasFiles ? `${result}\n${bot.filesSkipped}` : result);
    },
  };
}

type BotCopy = ReturnType<typeof getDictionaryFor>["channels"]["slack"]["bot"];

function botCopy(locale: Locale): BotCopy {
  return getDictionaryFor(locale).channels.slack.bot;
}

/**
 * The integration for the Slack user who ran the shortcut. The install stores
 * the Enterprise Grid org when there is one, else the workspace; the shortcut
 * is matched on the same key, then on the workspace alone — an account linked
 * before its workspace joined a Grid org.
 */
async function findSlackIntegration(supabase: SupabaseClient, payload: SlackMessageShortcut): Promise<ChannelIntegration | null> {
  const scope = shortcutScope(payload);
  const keys = [
    slackExternalUserId(scope, payload.user.id),
    slackExternalUserId({ enterpriseId: null, teamId: scope.teamId }, payload.user.id),
  ].filter((key, index, all): key is string => Boolean(key) && all.indexOf(key) === index);

  for (const key of keys) {
    const integration = await findActiveIntegration(supabase, "slack", key);
    if (integration) return integration;
  }
  return null;
}
