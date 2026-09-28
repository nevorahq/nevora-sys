import { describe, expect, it } from "vitest";
import { hasMedia, parseTelegramCommand, telegramUpdateSchema } from "./telegram-update";

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
    expect(hasMedia({ ...base, photo: [{}] })).toBe(true);
    expect(hasMedia({ ...base, document: {} })).toBe(true);
    expect(hasMedia({ ...base, voice: {} })).toBe(true);
    expect(hasMedia({ ...base, text: "hi" })).toBe(false);
  });
});
