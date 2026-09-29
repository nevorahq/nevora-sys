import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildSlackAuthorizeUrl,
  escapeSlackText,
  exchangeSlackCode,
  getSlackConfig,
  isSlackResponseUrl,
  postSlackEphemeral,
  slackExternalUserId,
  verifySlackSignature,
} from "./slack-api";

const SECRET = "test-signing-secret";
const NOW_MS = 1_790_000_000_000;
const NOW_S = String(Math.floor(NOW_MS / 1000));
const body = "payload=%7B%22type%22%3A%22message_action%22%7D";
const sign = (timestamp: string, raw = body, secret = SECRET) =>
  `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex")}`;

const config = { clientId: "123.456", clientSecret: "shh", signingSecret: SECRET };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifySlackSignature", () => {
  it("accepts Slack's v0 HMAC over the raw body", () => {
    expect(verifySlackSignature(SECRET, body, { timestamp: NOW_S, signature: sign(NOW_S) }, NOW_MS)).toBe(true);
  });

  it("rejects a wrong secret, a changed body or a missing header", () => {
    expect(verifySlackSignature(SECRET, body, { timestamp: NOW_S, signature: sign(NOW_S, body, "other") }, NOW_MS)).toBe(false);
    expect(verifySlackSignature(SECRET, `${body}x`, { timestamp: NOW_S, signature: sign(NOW_S) }, NOW_MS)).toBe(false);
    expect(verifySlackSignature(SECRET, body, { timestamp: null, signature: sign(NOW_S) }, NOW_MS)).toBe(false);
    expect(verifySlackSignature(SECRET, body, { timestamp: NOW_S, signature: null }, NOW_MS)).toBe(false);
    expect(verifySlackSignature(SECRET, body, { timestamp: NOW_S, signature: "v1=abc" }, NOW_MS)).toBe(false);
  });

  it("rejects a replay outside the five-minute window, in either direction", () => {
    const old = String(Number(NOW_S) - 301);
    const future = String(Number(NOW_S) + 301);
    expect(verifySlackSignature(SECRET, body, { timestamp: old, signature: sign(old) }, NOW_MS)).toBe(false);
    expect(verifySlackSignature(SECRET, body, { timestamp: future, signature: sign(future) }, NOW_MS)).toBe(false);
    const edge = String(Number(NOW_S) - 300);
    expect(verifySlackSignature(SECRET, body, { timestamp: edge, signature: sign(edge) }, NOW_MS)).toBe(true);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(verifySlackSignature(SECRET, body, { timestamp: "12e3", signature: sign("12e3") }, NOW_MS)).toBe(false);
  });
});

describe("config and identity", () => {
  it("is configured only with all three secrets", () => {
    vi.stubEnv("SLACK_CLIENT_ID", "id");
    vi.stubEnv("SLACK_CLIENT_SECRET", "secret");
    vi.stubEnv("SLACK_SIGNING_SECRET", "");
    expect(getSlackConfig()).toBeNull();
    vi.stubEnv("SLACK_SIGNING_SECRET", "sign");
    expect(getSlackConfig()).toEqual({ clientId: "id", clientSecret: "secret", signingSecret: "sign" });
  });

  it("asks for the commands scope only", () => {
    const url = new URL(buildSlackAuthorizeUrl(config, "st4te", "https://app.test/api/channels/slack/callback"));
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("scope")).toBe("commands");
    expect(url.searchParams.get("state")).toBe("st4te");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/api/channels/slack/callback");
    expect(url.searchParams.has("user_scope")).toBe(false);
  });

  it("keys a Slack user by the Grid org when there is one, else by the workspace", () => {
    expect(slackExternalUserId({ enterpriseId: null, teamId: "T1" }, "U1")).toBe("T1:U1");
    expect(slackExternalUserId({ enterpriseId: "E1", teamId: "T1" }, "U1")).toBe("E1:U1");
    expect(slackExternalUserId({ enterpriseId: null, teamId: null }, "U1")).toBeNull();
  });
});

describe("exchangeSlackCode", () => {
  it("keeps the identity and drops the bot token", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        ok: true,
        access_token: "xoxb-secret",
        team: { id: "T1", name: "Acme" },
        enterprise: null,
        authed_user: { id: "U1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const install = await exchangeSlackCode(config, "code-1", "https://app.test/cb");
    expect(install).toEqual({ userId: "U1", teamId: "T1", teamName: "Acme", enterpriseId: null });
    expect(JSON.stringify(install)).not.toContain("xoxb");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/oauth.v2.access");
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("code")).toBe("code-1");
    expect(sent.get("redirect_uri")).toBe("https://app.test/cb");
  });

  it("returns null on a Slack error or without the installing user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error: "invalid_code" })));
    expect(await exchangeSlackCode(config, "bad", "https://app.test/cb")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, team: { id: "T1" } })));
    expect(await exchangeSlackCode(config, "c", "https://app.test/cb")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network");
    }));
    expect(await exchangeSlackCode(config, "c", "https://app.test/cb")).toBeNull();
  });
});

describe("ephemeral replies", () => {
  it("posts only to Slack's hooks host", async () => {
    expect(isSlackResponseUrl("https://hooks.slack.com/actions/T1/1/abc")).toBe(true);
    expect(isSlackResponseUrl("http://hooks.slack.com/actions/T1/1/abc")).toBe(false);
    expect(isSlackResponseUrl("https://hooks.slack.com.evil.test/x")).toBe(false);
    expect(isSlackResponseUrl("https://169.254.169.254/latest")).toBe(false);

    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await postSlackEphemeral("https://evil.test/x", "hi")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an ephemeral, escaped plain-text reply", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await postSlackEphemeral("https://hooks.slack.com/actions/T1/1/abc", "Pay <@U1> & co")).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ response_type: "ephemeral", text: "Pay &lt;@U1&gt; &amp; co" });
  });

  it("escapes Slack's three control characters", () => {
    expect(escapeSlackText("<!channel> a&b > c")).toBe("&lt;!channel&gt; a&amp;b &gt; c");
  });
});
