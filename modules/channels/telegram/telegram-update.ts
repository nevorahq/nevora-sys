import { z } from "zod";

/**
 * The slice of a Telegram `Update` the capture adapter reads. Everything else
 * passes through untouched (`.passthrough()` is not needed: unknown keys are
 * simply dropped), and an update we don't model parses to `message: undefined`
 * and is acknowledged without action.
 */
const telegramUserSchema = z.object({
  id: z.number().int(),
  is_bot: z.boolean().optional().default(false),
  username: z.string().max(64).optional(),
  language_code: z.string().max(16).optional(),
});

const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  from: telegramUserSchema.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  // Presence flags only — media is not captured yet (see ADR 002 step 2).
  photo: z.array(z.unknown()).optional(),
  document: z.unknown().optional(),
  voice: z.unknown().optional(),
  video: z.unknown().optional(),
  audio: z.unknown().optional(),
});

export const telegramUpdateSchema = z.object({
  update_id: z.number().int(),
  message: telegramMessageSchema.optional(),
});

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
export type TelegramMessage = z.infer<typeof telegramMessageSchema>;

export type TelegramCommand =
  | { kind: "start"; code: string | null }
  | { kind: "stop" }
  | { kind: "help" }
  | { kind: "unknown" };

/**
 * `/start ABCD2345`, `/start@NevoraBot ABCD2345`, `/stop`, `/help`. Null when
 * the text is not a command at all (then it is a capture).
 */
export function parseTelegramCommand(text: string): TelegramCommand | null {
  const match = text.trim().match(/^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const argument = match[2]?.trim() || null;
  switch (match[1].toLowerCase()) {
    case "start":
      return { kind: "start", code: argument };
    case "stop":
    case "disconnect":
      return { kind: "stop" };
    case "help":
      return { kind: "help" };
    default:
      return { kind: "unknown" };
  }
}

/** Whether the message carries something other than text (photo, file, voice…). */
export function hasMedia(message: TelegramMessage): boolean {
  return Boolean(message.photo?.length || message.document || message.voice || message.video || message.audio);
}
