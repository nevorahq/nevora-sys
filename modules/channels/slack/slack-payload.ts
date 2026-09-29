import { z } from "zod";

/**
 * The slice of a Slack interaction payload the capture adapter reads — a
 * message shortcut (`type: "message_action"`). Slack posts it form-encoded as
 * `payload=<json>`; any other interaction type parses to null and is
 * acknowledged without action.
 */
const slackFileSchema = z.object({ id: z.string().optional(), name: z.string().optional() });

const slackLegacyAttachmentSchema = z.object({
  pretext: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  fallback: z.string().optional(),
});

const messageShortcutSchema = z.object({
  type: z.literal("message_action"),
  callback_id: z.string(),
  response_url: z.string().max(2048),
  user: z.object({ id: z.string().min(1).max(64), team_id: z.string().max(64).optional() }),
  channel: z.object({ id: z.string().min(1).max(64), name: z.string().max(200).optional() }),
  team: z.object({ id: z.string().min(1).max(64), enterprise_id: z.string().max(64).optional() }).nullish(),
  enterprise: z.object({ id: z.string().min(1).max(64) }).nullish(),
  message: z.object({
    ts: z.string().min(1).max(32),
    text: z.string().optional(),
    files: z.array(slackFileSchema).optional(),
    // Messages posted by other apps often carry their content here, not in `text`.
    attachments: z.array(slackLegacyAttachmentSchema).optional(),
  }),
});

export type SlackMessageShortcut = z.infer<typeof messageShortcutSchema>;

/** Parse the form-encoded interaction body; null for anything but a message shortcut. */
export function parseSlackInteraction(rawBody: string): SlackMessageShortcut | null {
  const payload = new URLSearchParams(rawBody).get("payload");
  if (!payload) return null;
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return null;
  }
  const parsed = messageShortcutSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * The shortcut's workspace scope: the Enterprise Grid org when there is one,
 * else the workspace. Mirrors what the OAuth install stores.
 */
export function shortcutScope(payload: SlackMessageShortcut): { enterpriseId: string | null; teamId: string | null } {
  return {
    enterpriseId: payload.enterprise?.id ?? payload.team?.enterprise_id ?? null,
    teamId: payload.team?.id ?? payload.user.team_id ?? null,
  };
}

/**
 * The text to capture: the message's own text, or — for a message another app
 * posted — its legacy attachments. Slack markup is turned into plain text.
 */
export function slackMessageText(message: SlackMessageShortcut["message"]): string {
  const own = message.text?.trim();
  if (own) return slackMarkupToText(own);
  const fromAttachments = (message.attachments ?? [])
    .map((attachment) =>
      [attachment.pretext, attachment.title, attachment.text ?? attachment.fallback]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n");
  return slackMarkupToText(fromAttachments);
}

/**
 * Slack's control sequences → readable text: `<url|label>` → `label (url)`,
 * `<#C1|general>` → `#general`, `<!here>` → `@here`, user mentions keep their
 * label when Slack sent one; then the three escaped entities are unescaped.
 */
export function slackMarkupToText(text: string): string {
  return text
    .replace(/<([^<>]+)>/g, (_match, inner: string) => {
      const [target, label] = splitOnce(inner, "|");
      if (target.startsWith("@")) return label ? (label.startsWith("@") ? label : `@${label}`) : target;
      if (target.startsWith("#")) return label ? `#${label}` : target;
      if (target.startsWith("!")) {
        if (label) return label;
        const keyword = target.slice(1).split("^")[0];
        return `@${keyword}`;
      }
      const url = target.startsWith("mailto:") ? target.slice("mailto:".length) : target;
      return label && label !== url ? `${label} (${url})` : url;
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function splitOnce(value: string, separator: string): [string, string | null] {
  const index = value.indexOf(separator);
  return index === -1 ? [value, null] : [value.slice(0, index), value.slice(index + 1)];
}

/** Slack's names for conversations that are not channels: no "#name" to show. */
const NON_CHANNEL_NAMES = new Set(["directmessage", "privategroup"]);

/**
 * Where the shortcut's message lives, as a learned project rule matches it
 * (migration 125): the conversation, qualified by its workspace (or Grid org),
 * plus a "#name" label for Settings when it is a named channel.
 */
export function slackChannelSignals(payload: SlackMessageShortcut): { slack_channel?: string; slack_channel_label?: string } {
  const scope = shortcutScope(payload);
  const owner = scope.teamId ?? scope.enterpriseId;
  if (!owner) return {};
  const name = payload.channel.name?.trim();
  const label = name && !NON_CHANNEL_NAMES.has(name) && !name.startsWith("mpdm-") ? `#${name}` : undefined;
  return { slack_channel: `${owner}:${payload.channel.id}`, ...(label ? { slack_channel_label: label } : {}) };
}
