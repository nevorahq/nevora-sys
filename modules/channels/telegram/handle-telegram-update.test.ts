import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  find: vi.fn(),
  revoke: vi.fn(),
  resolve: vi.fn(),
  capture: vi.fn(),
  process: vi.fn(),
  captureFile: vi.fn(),
  processFile: vi.fn(),
  download: vi.fn(),
}));
vi.mock("../services/link-codes", () => ({
  consumeLinkCode: mocks.consume,
  findActiveIntegration: mocks.find,
  revokeIntegrationByExternal: mocks.revoke,
}));
vi.mock("../services/channel-context", () => ({ resolveChannelContext: mocks.resolve }));
vi.mock("../services/channel-intake", () => ({
  captureChannelText: mocks.capture,
  processChannelCapture: mocks.process,
  captureChannelFile: mocks.captureFile,
  processChannelFileCapture: mocks.processFile,
}));

import { handleTelegramUpdate, localeFromLanguageCode } from "./handle-telegram-update";
import type { TelegramUpdate } from "./telegram-update";

const integration = { id: "i1", organization_id: "org-1", workspace_id: "ws-1", user_id: "user-1", channel: "telegram" };
const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } };

/** Reads answer per table: profiles → language, organizations → name. */
function fakeSupabase(language: string | null = "ru") {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.maybeSingle = async () => ({
      data: table === "profiles" ? { language } : table === "organizations" ? { name: "Acme SRL" } : null,
    });
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

function update(text: string | undefined, extra: Record<string, unknown> = {}, chatType = "private"): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 55,
      chat: { id: 42, type: chatType },
      from: { id: 42, is_bot: false, username: "anna", language_code: "en" },
      text,
      ...extra,
    },
  } as TelegramUpdate;
}

let sent: string[];
const deps = (language: string | null = "ru") => ({
  supabase: fakeSupabase(language),
  send: async (_chatId: string, text: string) => {
    sent.push(text);
    return true;
  },
  download: mocks.download,
  appUrl: "https://app.nevora.test",
});

beforeEach(() => {
  sent = [];
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("handleTelegramUpdate — who may talk to the bot", () => {
  it("ignores groups, bots and non-message updates without replying", async () => {
    expect((await handleTelegramUpdate(update("hi", {}, "group"), deps())).action).toBe("ignored");
    expect((await handleTelegramUpdate({ update_id: 3 }, deps())).action).toBe("ignored");
    const fromBot = update("hi");
    fromBot.message!.from!.is_bot = true;
    expect((await handleTelegramUpdate(fromBot, deps())).action).toBe("ignored");
    expect(sent).toEqual([]);
  });

  it("asks an unknown sender to connect first, in their Telegram language", async () => {
    mocks.find.mockResolvedValue(null);
    const result = await handleTelegramUpdate(update("Купить картридж"), deps());
    expect(result.action).toBe("not_linked");
    expect(sent[0]).toContain("isn't connected");
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

describe("handleTelegramUpdate — linking", () => {
  it("links with /start <code> and greets in the user's app language", async () => {
    mocks.consume.mockResolvedValue({ ok: true, integration });
    const result = await handleTelegramUpdate(update("/start ABCD2345"), deps("ru"));
    expect(result.action).toBe("linked");
    expect(mocks.consume).toHaveBeenCalledWith(expect.anything(), "telegram", "ABCD2345", {
      userId: "42",
      chatId: "42",
      username: "anna",
    });
    expect(sent[0]).toBe("Подключено к Acme SRL. Присылайте любые дела — я добавлю их во Входящие.");
  });

  it("rejects a bad code", async () => {
    mocks.consume.mockResolvedValue({ ok: false, reason: "invalid" });
    expect((await handleTelegramUpdate(update("/start NOPE"), deps())).action).toBe("link_rejected");
    expect(sent[0]).toContain("invalid or has expired");
  });

  it("welcomes a bare /start from a stranger", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await handleTelegramUpdate(update("/start"), deps())).action).toBe("welcome");
  });

  it("unlinks with /stop", async () => {
    mocks.revoke.mockResolvedValue(true);
    expect((await handleTelegramUpdate(update("/stop"), deps())).action).toBe("stopped");
    expect(sent[0]).toContain("Disconnected");
  });
});

describe("handleTelegramUpdate — capture", () => {
  beforeEach(() => {
    mocks.find.mockResolvedValue(integration);
    mocks.resolve.mockResolvedValue({ ok: true, ctx });
  });

  it("stores the text before acknowledging, then runs AI and replies with the draft", async () => {
    const entry = { id: "e1", status: "captured" };
    mocks.capture.mockResolvedValue({ ok: true, entry, reused: false });
    mocks.process.mockResolvedValue({ status: "suggested", suggestions: [{ id: "s1", title: "Отправить КП клиенту" }] });

    const result = await handleTelegramUpdate(update("Завтра до 15:00 отправить КП клиенту"), deps("ru"));

    expect(result.action).toBe("captured");
    expect(mocks.capture).toHaveBeenCalledWith(expect.anything(), ctx, {
      channel: "telegram",
      messageKey: "42:55",
      text: "Завтра до 15:00 отправить КП клиенту",
    });
    // Nothing is sent and no AI runs until after the acknowledgement.
    expect(mocks.process).not.toHaveBeenCalled();
    expect(sent).toEqual([]);

    await result.after!();
    expect(mocks.process).toHaveBeenCalledWith(expect.anything(), ctx, entry);
    expect(sent[0]).toBe(
      "Добавлено во Входящие: «Отправить КП клиенту». Подтвердите в Nevora: https://app.nevora.test/dashboard/inbox?tab=review&suggestion=s1",
    );
  });

  it("stays silent on a redelivered message that was already processed", async () => {
    mocks.capture.mockResolvedValue({ ok: true, entry: { id: "e1", status: "suggested" }, reused: true });
    const result = await handleTelegramUpdate(update("again"), deps());
    expect(result).toEqual({ action: "duplicate" });
    expect(sent).toEqual([]);
  });

  it("resumes a redelivered capture whose AI step never ran", async () => {
    mocks.capture.mockResolvedValue({ ok: true, entry: { id: "e1", status: "captured" }, reused: true });
    mocks.process.mockResolvedValue({ status: "failed", suggestions: [] });
    const result = await handleTelegramUpdate(update("again"), deps("en"));
    expect(result.action).toBe("duplicate");
    await result.after!();
    expect(sent[0]).toBe("Added to your Inbox. Review it in Nevora: https://app.nevora.test/dashboard/inbox?tab=review");
  });

  it("throws when the capture could not be stored, so Telegram redelivers", async () => {
    mocks.capture.mockResolvedValue({ ok: false, code: "failed" });
    await expect(handleTelegramUpdate(update("text"), deps())).rejects.toThrow();
  });

  it("refuses when the organization is read-only, without capturing", async () => {
    mocks.resolve.mockResolvedValue({ ok: false, reason: "read_only" });
    expect((await handleTelegramUpdate(update("text"), deps("en"))).action).toBe("context_denied");
    expect(sent[0]).toContain("read-only");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("refuses voice, video and audio without downloading anything", async () => {
    const result = await handleTelegramUpdate(update(undefined, { voice: {} }), deps("en"));
    expect(result.action).toBe("media_not_supported");
    expect(sent[0]).toContain("Voice messages");
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("answers /help and unknown commands instead of capturing them", async () => {
    expect((await handleTelegramUpdate(update("/help"), deps())).action).toBe("help");
    expect((await handleTelegramUpdate(update("/weather"), deps())).action).toBe("help");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("tells the sender the limit when the text is too long", async () => {
    mocks.capture.mockResolvedValue({ ok: false, code: "too_long" });
    expect((await handleTelegramUpdate(update("x"), deps("en"))).action).toBe("too_long");
    expect(sent[0]).toContain("4000");
  });
});

describe("localeFromLanguageCode", () => {
  it.each([
    ["ru", "ru"],
    ["ro", "ro"],
    ["en-US", "en"],
    ["de", "en"],
    [undefined, "en"],
  ])("%s → %s", (code, locale) => {
    expect(localeFromLanguageCode(code)).toBe(locale);
  });
});

describe("handleTelegramUpdate — photos and documents", () => {
  const photo = { photo: [{ file_id: "small", file_size: 1_000 }, { file_id: "large", file_size: 90_000 }], caption: " Обед с клиентом " };

  beforeEach(() => {
    mocks.find.mockResolvedValue(integration);
    mocks.resolve.mockResolvedValue({ ok: true, ctx });
    mocks.download.mockResolvedValue({ ok: true, bytes: new Uint8Array([1, 2, 3]).buffer });
  });

  it("stores the largest photo with its caption before acknowledging, then reads it and reports the receipt", async () => {
    mocks.captureFile.mockResolvedValue({ ok: true, documentId: "d1", entryId: "e1", extractionId: "x1", reused: false });
    mocks.processFile.mockResolvedValue({ kind: "receipt", vendor: "Linella", amount: 245.5, currency: "MDL" });

    const result = await handleTelegramUpdate(update(undefined, photo), deps("ru"));

    expect(result.action).toBe("captured");
    expect(mocks.download).toHaveBeenCalledWith("large", 10 * 1024 * 1024);
    const stored = mocks.captureFile.mock.calls[0][2];
    expect(stored).toMatchObject({ channel: "telegram", messageKey: "42:55", note: "Обед с клиентом", kind: "photo" });
    expect(stored.file).toBeInstanceOf(File);
    expect(stored.file.type).toBe("image/jpeg");
    // Nothing is read or sent until after the acknowledgement.
    expect(mocks.processFile).not.toHaveBeenCalled();
    expect(sent).toEqual([]);

    await result.after!();
    expect(mocks.processFile).toHaveBeenCalledWith(expect.anything(), ctx, { documentId: "d1", entryId: "e1", extractionId: "x1" });
    expect(sent[0]).toMatch(/^Чек распознан: Linella — 245,50\sMDL\. Проверьте и сохраните в Финансы в Nevora: https:\/\/app\.nevora\.test\/dashboard\/inbox\?tab=review$/);
  });

  it("reports task drafts found in a document", async () => {
    mocks.captureFile.mockResolvedValue({ ok: true, documentId: "d1", entryId: "e1", extractionId: "x1", reused: false });
    mocks.processFile.mockResolvedValue({ kind: "tasks", count: 3 });
    const result = await handleTelegramUpdate(
      update(undefined, { document: { file_id: "f1", file_name: "brief.pdf", mime_type: "application/pdf", file_size: 5_000 } }),
      deps("en"),
    );
    expect(mocks.captureFile.mock.calls[0][2]).toMatchObject({ kind: "document" });
    expect(mocks.captureFile.mock.calls[0][2].file.name).toBe("brief.pdf");
    await result.after!();
    expect(sent[0]).toBe("Added to your Inbox. Tasks found: 3. Confirm them in Nevora: https://app.nevora.test/dashboard/inbox?tab=review");
  });

  it("refuses a file over the limit from its reported size, without downloading it", async () => {
    const result = await handleTelegramUpdate(update(undefined, { document: { file_id: "big", file_size: 50 * 1024 * 1024 } }), deps("en"));
    expect(result.action).toBe("media_too_large");
    expect(sent[0]).toContain("10 MB");
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("throws on a failed download, so Telegram redelivers", async () => {
    mocks.download.mockResolvedValue({ ok: false, reason: "failed" });
    await expect(handleTelegramUpdate(update(undefined, photo), deps())).rejects.toThrow();
    expect(mocks.captureFile).not.toHaveBeenCalled();
  });

  it("explains a rejected file type and a reached plan limit", async () => {
    mocks.captureFile.mockResolvedValueOnce({ ok: false, code: "invalid_file" });
    expect((await handleTelegramUpdate(update(undefined, photo), deps("en"))).action).toBe("media_rejected");
    expect(sent[0]).toContain("can't be added");

    mocks.captureFile.mockResolvedValueOnce({ ok: false, code: "plan_limit" });
    await handleTelegramUpdate(update(undefined, photo), deps("en"));
    expect(sent[1]).toContain("limit has been reached");
  });

  it("stays silent on a redelivered file", async () => {
    mocks.captureFile.mockResolvedValue({ ok: true, documentId: "d1", entryId: "e1", extractionId: null, reused: true });
    expect(await handleTelegramUpdate(update(undefined, photo), deps())).toEqual({ action: "duplicate" });
    expect(sent).toEqual([]);
  });

  it("does not download for a sender whose organization is read-only", async () => {
    mocks.resolve.mockResolvedValue({ ok: false, reason: "read_only" });
    expect((await handleTelegramUpdate(update(undefined, photo), deps())).action).toBe("context_denied");
    expect(mocks.download).not.toHaveBeenCalled();
  });
});

