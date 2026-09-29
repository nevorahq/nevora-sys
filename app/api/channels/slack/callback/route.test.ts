import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAppAccess: vi.fn(),
  exchange: vi.fn(),
  link: vi.fn(),
  service: {} as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/security", () => ({
  requireAppAccess: mocks.requireAppAccess,
  isAccessError: (error: unknown) => error instanceof Error && error.message === "access",
}));
vi.mock("@/lib/supabase/service-role", () => ({ getServiceRoleClient: () => mocks.service }));
vi.mock("@/modules/channels/services/link-codes", () => ({ linkExternalAccount: mocks.link }));
vi.mock("@/modules/channels/slack/slack-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/channels/slack/slack-api")>()),
  exchangeSlackCode: mocks.exchange,
}));

import { GET } from "./route";

const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } };
const cookieFor = (state: string, organizationId = "org-1", userId = "user-1") =>
  Buffer.from(JSON.stringify({ state, organizationId, userId }), "utf8").toString("base64url");

function request(query: string, cookie: string | null) {
  return new NextRequest(`https://app.test/api/channels/slack/callback?${query}`, {
    headers: cookie ? { cookie: `nevora_slack_oauth_state=${cookie}` } : {},
  });
}
const resultOf = (response: Response) => new URL(response.headers.get("location") ?? "").searchParams.get("slack");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  vi.stubEnv("SLACK_CLIENT_ID", "id");
  vi.stubEnv("SLACK_CLIENT_SECRET", "secret");
  vi.stubEnv("SLACK_SIGNING_SECRET", "sign");
  for (const mock of [mocks.requireAppAccess, mocks.exchange, mocks.link]) mock.mockReset();
  mocks.requireAppAccess.mockResolvedValue(ctx);
  mocks.exchange.mockResolvedValue({ userId: "U1", teamId: "T1", teamName: "Acme", enterpriseId: null });
  mocks.link.mockResolvedValue({ ok: true, integration: {} });
});

describe("GET /api/channels/slack/callback", () => {
  it("links the installing Slack user to the signed-in user, keeping no token", async () => {
    const response = await GET(request("code=c1&state=abc", cookieFor("abc")));
    expect(resultOf(response)).toBe("connected");
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/settings/integrations");
    expect(mocks.exchange).toHaveBeenCalledWith(expect.anything(), "c1", "https://app.test/api/channels/slack/callback");
    expect(mocks.link).toHaveBeenCalledWith(
      mocks.service,
      "slack",
      { organizationId: "org-1", workspaceId: "ws-1", userId: "user-1" },
      { userId: "T1:U1", chatId: null, username: null },
      { team_id: "T1", team_name: "Acme", enterprise_id: null },
    );
    // The one-time state cookie is cleared.
    expect(response.headers.get("set-cookie")).toContain("nevora_slack_oauth_state=;");
  });

  it("rejects a missing or mismatched state before anything else", async () => {
    expect(resultOf(await GET(request("code=c1&state=abc", null)))).toBe("invalid_state");
    expect(resultOf(await GET(request("code=c1&state=zzz", cookieFor("abc"))))).toBe("invalid_state");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("rejects a callback completed by another account than the one that started it", async () => {
    expect(resultOf(await GET(request("code=c1&state=abc", cookieFor("abc", "org-1", "user-2"))))).toBe("invalid_state");
    expect(resultOf(await GET(request("code=c1&state=abc", cookieFor("abc", "org-9"))))).toBe("invalid_state");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("reports a declined install and a failed exchange", async () => {
    expect(resultOf(await GET(request("error=access_denied&state=abc", cookieFor("abc"))))).toBe("denied");
    mocks.exchange.mockResolvedValue(null);
    expect(resultOf(await GET(request("code=c1&state=abc", cookieFor("abc"))))).toBe("failed");
    expect(mocks.link).not.toHaveBeenCalled();
  });

  it("reports a role that cannot capture", async () => {
    mocks.requireAppAccess.mockRejectedValue(new Error("access"));
    expect(resultOf(await GET(request("code=c1&state=abc", cookieFor("abc"))))).toBe("forbidden");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
});
