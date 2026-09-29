import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), after: vi.fn(), client: {} as unknown }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => mocks.client }));
vi.mock("@/modules/channels/slack/handle-slack-shortcut", () => ({ handleSlackShortcut: mocks.handle }));
vi.mock("server-only", () => ({}));

import { POST } from "./route";

const SIGNING_SECRET = "slack-signing-secret";
const shortcut = {
  type: "message_action",
  callback_id: "send_to_nevora",
  response_url: "https://hooks.slack.com/app/T1/1/abc",
  user: { id: "U1" },
  channel: { id: "C1" },
  team: { id: "T1", domain: "acme" },
  message: { ts: "1.2", text: "hi" },
};
const formBody = (payload: unknown) => new URLSearchParams({ payload: JSON.stringify(payload) }).toString();

function request(body: string, opts: { secret?: string; timestamp?: number } = {}) {
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = `v0=${createHmac("sha256", opts.secret ?? SIGNING_SECRET).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  return new Request("https://app.test/api/channels/slack/interactivity", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("SLACK_CLIENT_ID", "id");
  vi.stubEnv("SLACK_CLIENT_SECRET", "secret");
  vi.stubEnv("SLACK_SIGNING_SECRET", SIGNING_SECRET);
  mocks.handle.mockReset();
  mocks.after.mockReset();
});

describe("POST /api/channels/slack/interactivity", () => {
  it("fails closed when Slack is not configured", async () => {
    vi.stubEnv("SLACK_SIGNING_SECRET", "");
    expect((await POST(request(formBody(shortcut)))).status).toBe(503);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("rejects a bad signature and a stale request", async () => {
    expect((await POST(request(formBody(shortcut), { secret: "wrong" }))).status).toBe(401);
    const stale = Math.floor(Date.now() / 1000) - 600;
    expect((await POST(request(formBody(shortcut), { timestamp: stale }))).status).toBe(401);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("acknowledges other interactions without handling them", async () => {
    const response = await POST(request(formBody({ type: "block_actions" })));
    expect(response.status).toBe(200);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("handles the shortcut and defers the reply until after the response", async () => {
    const work = vi.fn();
    mocks.handle.mockResolvedValue({ action: "captured", after: work });
    const response = await POST(request(formBody(shortcut)));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(mocks.handle).toHaveBeenCalledWith(
      expect.objectContaining({ callback_id: "send_to_nevora" }),
      expect.objectContaining({ supabase: mocks.client }),
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
  });

  it("answers 500 on an unexpected failure", async () => {
    mocks.handle.mockRejectedValue(new Error("db down"));
    expect((await POST(request(formBody(shortcut)))).status).toBe(500);
  });
});
