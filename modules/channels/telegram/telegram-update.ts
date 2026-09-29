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

const telegramPhotoSizeSchema = z.object({
  file_id: z.string().max(512),
  file_size: z.number().int().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

const telegramDocumentSchema = z.object({
  file_id: z.string().max(512),
  file_name: z.string().max(512).optional(),
  mime_type: z.string().max(255).optional(),
  file_size: z.number().int().optional(),
});

const telegramAudioSchema = z.object({
  file_id: z.string().max(512),
  duration: z.number().int().nonnegative().optional(),
  mime_type: z.string().max(255).optional(),
  file_size: z.number().int().optional(),
  file_name: z.string().max(512).optional(),
});

const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  from: telegramUserSchema.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  // Telegram sends each photo in several sizes, smallest first.
  photo: z.array(telegramPhotoSizeSchema).optional(),
  document: telegramDocumentSchema.optional(),
  // A voice note (OGG/Opus) or a forwarded audio file: transcribed, then captured as text.
  voice: telegramAudioSchema.optional(),
  audio: telegramAudioSchema.optional(),
  // Presence flag only — not captured.
  video: z.unknown().optional(),
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

export type TelegramAttachment = { fileId: string; fileName: string; mimeType: string | null; size: number | null; kind: "photo" | "document" };

/**
 * The file a message carries that the Inbox can read: the largest size of a
 * photo, or a document. Null for text, voice, video and audio.
 */
export function pickAttachment(message: TelegramMessage): TelegramAttachment | null {
  const photo = message.photo?.at(-1);
  if (photo) {
    return { fileId: photo.file_id, fileName: `telegram-photo-${message.message_id}.jpg`, mimeType: "image/jpeg", size: photo.file_size ?? null, kind: "photo" };
  }
  if (message.document) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name?.trim() || `telegram-file-${message.message_id}`,
      mimeType: message.document.mime_type ?? null,
      size: message.document.file_size ?? null,
      kind: "document",
    };
  }
  return null;
}

export type TelegramVoice = { fileId: string; fileName: string; mimeType: string; durationSeconds: number | null; size: number | null };

/** A voice note or an audio file to transcribe; null otherwise. */
export function pickVoice(message: TelegramMessage): TelegramVoice | null {
  const audio = message.voice ?? message.audio;
  if (!audio) return null;
  const mimeType = audio.mime_type ?? (message.voice ? "audio/ogg" : "audio/mpeg");
  const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : mimeType.includes("wav") ? "wav" : "mp3";
  return {
    fileId: audio.file_id,
    fileName: audio.file_name?.trim() || `telegram-voice-${message.message_id}.${extension}`,
    mimeType,
    durationSeconds: audio.duration ?? null,
    size: audio.file_size ?? null,
  };
}

/** Whether the message carries something other than text (photo, file, voice…). */
export function hasMedia(message: TelegramMessage): boolean {
  return Boolean(message.photo?.length || message.document || message.voice || message.video || message.audio);
}
