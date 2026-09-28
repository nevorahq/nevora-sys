import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), after: vi.fn(), client: {} as unknown }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => mocks.client }));
vi.mock("@/modules/channels/telegram/handle-telegram-update", () => ({ handleTelegramUpdate: mocks.handle }));
vi.mock("@/modules/channels/telegram/telegram-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/channels/telegram/telegram-api")>()),
  sendTelegramMessage: vi.fn(),
}));
vi.mock("server-only", () => ({}));

import { POST } from "./route";

const SECRET = "s3cret-token";
const body = JSON.stringify({ update_id: 9, message: { message_id: 1, chat: { id: 1, type: "private" }, text: "hi" } });
const request = (secret: string | null, payload = body) =>
  new Request("https://app.test/api/channels/telegram/webhook", {
    method: "POST",
    headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
    body: payload,
  });

beforeEach(() => {
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  mocks.handle.mockReset();
  mocks.after.mockReset();
});

describe("POST /api/channels/telegram/webhook", () => {
  it("fails closed when the bot is not configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "");
    expect((await POST(request(SECRET))).status).toBe(503);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong secret", async () => {
    expect((await POST(request(null))).status).toBe(401);
    expect((await POST(request("wrong-token-x"))).status).toBe(401);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("acknowledges junk without processing it, so Telegram does not retry forever", async () => {
    expect((await POST(request(SECRET, "{not json"))).status).toBe(200);
    expect((await POST(request(SECRET, JSON.stringify({ nope: true })))).status).toBe(200);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("handles the update and defers the AI step until after the response", async () => {
    const work = vi.fn();
    mocks.handle.mockResolvedValue({ action: "captured", after: work });
    const response = await POST(request(SECRET));
    expect(response.status).toBe(200);
    expect(mocks.handle).toHaveBeenCalledWith(
      expect.objectContaining({ update_id: 9 }),
      expect.objectContaining({ supabase: mocks.client }),
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
  });

  it("answers 500 when the capture could not be stored, so Telegram redelivers", async () => {
    mocks.handle.mockRejectedValue(new Error("db down"));
    expect((await POST(request(SECRET))).status).toBe(500);
  });
});
