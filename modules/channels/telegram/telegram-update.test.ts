import { describe, expect, it } from "vitest";
import { hasMedia, parseTelegramCommand, pickAttachment, telegramUpdateSchema } from "./telegram-update";

describe("parseTelegramCommand", () => {
  it.each([
    ["/start", { kind: "start", code: null }],
    ["/start ABCD2345", { kind: "start", code: "ABCD2345" }],
    ["/start@NevoraBot  abcd2345 ", { kind: "start", code: "abcd2345" }],
    ["/stop", { kind: "stop" }],
    ["/disconnect", { kind: "stop" }],
    ["/help", { kind: "help" }],
    ["/weather", { kind: "unknown" }],
  ])("%s", (text, expected) => {
    expect(parseTelegramCommand(text)).toEqual(expected);
  });

  it("treats ordinary text as a capture, not a command", () => {
    expect(parseTelegramCommand("Завтра до 15:00 отправить КП")).toBeNull();
    expect(parseTelegramCommand("see /start later")).toBeNull();
  });
});

describe("telegramUpdateSchema", () => {
  it("parses a private text message and drops unknown fields", () => {
    const parsed = telegramUpdateSchema.parse({
      update_id: 1,
      message: {
        message_id: 7,
        date: 1,
        chat: { id: 42, type: "private", first_name: "A" },
        from: { id: 42, is_bot: false, username: "anna", language_code: "ru" },
        text: "Купить картридж",
        entities: [],
      },
    });
    expect(parsed.message).toMatchObject({ message_id: 7, text: "Купить картридж", from: { username: "anna" } });
  });

  it("accepts updates it does not model (edits, callbacks) without a message", () => {
    expect(telegramUpdateSchema.parse({ update_id: 2, edited_message: {} }).message).toBeUndefined();
  });
});

describe("hasMedia", () => {
  const base = { message_id: 1, chat: { id: 1, type: "private" } };
  it("detects photos, files and voice", () => {
    expect(hasMedia({ ...base, photo: [{ file_id: "p" }] })).toBe(true);
    expect(hasMedia({ ...base, document: { file_id: "d" } })).toBe(true);
    expect(hasMedia({ ...base, voice: {} })).toBe(true);
    expect(hasMedia({ ...base, text: "hi" })).toBe(false);
  });
});

describe("pickAttachment", () => {
  const base = { message_id: 9, chat: { id: 1, type: "private" } };
  it("takes the largest size of a photo", () => {
    expect(pickAttachment({ ...base, photo: [{ file_id: "s", file_size: 10 }, { file_id: "l", file_size: 99 }] })).toEqual({
      fileId: "l",
      fileName: "telegram-photo-9.jpg",
      mimeType: "image/jpeg",
      size: 99,
      kind: "photo",
    });
  });

  it("keeps a document's own name and type, with a fallback name", () => {
    expect(pickAttachment({ ...base, document: { file_id: "d", file_name: "invoice.pdf", mime_type: "application/pdf" } })).toMatchObject({
      fileId: "d",
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      kind: "document",
    });
    expect(pickAttachment({ ...base, document: { file_id: "d" } })?.fileName).toBe("telegram-file-9");
  });

  it("ignores text and voice", () => {
    expect(pickAttachment({ ...base, text: "hi" })).toBeNull();
    expect(pickAttachment({ ...base, voice: {} })).toBeNull();
  });
});

