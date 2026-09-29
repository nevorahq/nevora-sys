import { beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => ({ auth: { admin: {} } }) }));
vi.mock("@/modules/channels/email/handle-inbound-email", () => ({ handleInboundEmail: mocks.handle }));
vi.mock("server-only", () => ({}));

import { POST } from "./route";

// A Standard Webhooks secret: "whsec_" + base64 key — the format Resend issues.
const SECRET = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
const payload = JSON.stringify({
  type: "email.received",
  created_at: "2026-09-28T10:00:00.000Z",
  data: { email_id: "em-1", to: ["inbox-abcdefghjkmn@in.nevora.app"], from: "anna@gmail.com", message_id: "<m1@x>" },
});

function signed(body = payload, secret = SECRET, at = new Date()) {
  const id = "msg_2abc";
  const signature = new Webhook(secret).sign(id, at, body);
  return new Request("https://app.test/api/channels/email/inbound", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": String(Math.floor(at.getTime() / 1000)), "svix-signature": signature },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_INBOUND_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("INBOUND_EMAIL_DOMAIN", "in.nevora.app");
  mocks.handle.mockReset();
  mocks.after.mockReset();
});

describe("POST /api/channels/email/inbound", () => {
  it("fails closed when email forwarding is not configured", async () => {
    vi.stubEnv("INBOUND_EMAIL_DOMAIN", "");
    expect((await POST(signed())).status).toBe(503);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("rejects an unsigned, wrongly signed, tampered or stale request", async () => {
    const unsigned = new Request("https://app.test/api/channels/email/inbound", { method: "POST", body: payload });
    expect((await POST(unsigned)).status).toBe(401);

    const otherSecret = `whsec_${Buffer.from("another-secret-another-secret-00").toString("base64")}`;
    expect((await POST(signed(payload, otherSecret))).status).toBe(401);

    const request = signed();
    const tampered = new Request(request.url, { method: "POST", headers: request.headers, body: payload.replace("em-1", "em-2") });
    expect((await POST(tampered)).status).toBe(401);

    expect((await POST(signed(payload, SECRET, new Date(Date.now() - 60 * 60 * 1000)))).status).toBe(401);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("verifies a genuine event, handles it and defers the reading", async () => {
    const work = vi.fn();
    mocks.handle.mockResolvedValue({ action: "captured", after: work });
    const response = await POST(signed());
    expect(response.status).toBe(200);
    expect(mocks.handle).toHaveBeenCalledWith(
      expect.objectContaining({ type: "email.received", data: expect.objectContaining({ email_id: "em-1" }) }),
      expect.objectContaining({ domain: "in.nevora.app" }),
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(work).not.toHaveBeenCalled();
  });

  it("answers 500 when the capture could not be stored, so Resend redelivers", async () => {
    mocks.handle.mockRejectedValue(new Error("db down"));
    expect((await POST(signed())).status).toBe(500);
  });
});
