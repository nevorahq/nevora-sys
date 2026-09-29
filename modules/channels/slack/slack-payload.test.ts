import { describe, expect, it } from "vitest";
import { parseSlackInteraction, shortcutScope, slackMarkupToText, slackMessageText } from "./slack-payload";

const shortcut = {
  type: "message_action",
  callback_id: "send_to_nevora",
  trigger_id: "1.2.3",
  response_url: "https://hooks.slack.com/app/T1/1/abc",
  message_ts: "1700000000.000100",
  user: { id: "U1", name: "anna", team_id: "T1" },
  channel: { id: "C1", name: "general" },
  team: { id: "T1", domain: "acme" },
  token: "legacy",
  action_ts: "1700000001.1",
  message: { type: "message", user: "U2", ts: "1700000000.000100", text: "Send the report by Friday" },
};
const form = (payload: unknown) => new URLSearchParams({ payload: JSON.stringify(payload) }).toString();

describe("parseSlackInteraction", () => {
  it("parses a form-encoded message shortcut", () => {
    const parsed = parseSlackInteraction(form(shortcut));
    expect(parsed?.callback_id).toBe("send_to_nevora");
    expect(parsed?.message.text).toBe("Send the report by Friday");
    expect(parsed && shortcutScope(parsed)).toEqual({ enterpriseId: null, teamId: "T1" });
  });

  it("returns null for other interactions and junk", () => {
    expect(parseSlackInteraction(form({ ...shortcut, type: "shortcut" }))).toBeNull();
    expect(parseSlackInteraction(form({ type: "block_actions" }))).toBeNull();
    expect(parseSlackInteraction("payload=%7Bnot-json")).toBeNull();
    expect(parseSlackInteraction("ssl_check=1")).toBeNull();
    expect(parseSlackInteraction("")).toBeNull();
  });

  it("reads the Grid org from either place Slack puts it, and a null team", () => {
    const grid = parseSlackInteraction(form({ ...shortcut, team: null, enterprise: { id: "E1", name: "Acme Corp" } }));
    expect(grid && shortcutScope(grid)).toEqual({ enterpriseId: "E1", teamId: "T1" });
    const inTeam = parseSlackInteraction(form({ ...shortcut, team: { id: "T9", domain: "x", enterprise_id: "E2" } }));
    expect(inTeam && shortcutScope(inTeam)).toEqual({ enterpriseId: "E2", teamId: "T9" });
  });
});

describe("slackMessageText", () => {
  it("prefers the message text and falls back to another app's attachments", () => {
    expect(slackMessageText({ ts: "1", text: "  hello  " })).toBe("hello");
    expect(
      slackMessageText({
        ts: "1",
        text: "",
        attachments: [{ pretext: "New issue", title: "Fix login", fallback: "Fix login — high" }, { text: "Due &lt;Friday&gt;" }],
      }),
    ).toBe("New issue\nFix login\nFix login — high\n\nDue <Friday>");
    expect(slackMessageText({ ts: "1" })).toBe("");
  });
});

describe("slackMarkupToText", () => {
  it("turns Slack control sequences into readable text", () => {
    expect(slackMarkupToText("Ask <@U123> in <#C1|general>, see <https://x.test/a?b=1&amp;c=2|the doc>")).toBe(
      "Ask @U123 in #general, see the doc (https://x.test/a?b=1&c=2)",
    );
    expect(slackMarkupToText("<@U1|anna> <!here> <!subteam^S1|@devs> <!date^1700000000^{date}|Nov 14>")).toBe(
      "@anna @here @devs Nov 14",
    );
    expect(slackMarkupToText("<https://x.test> <mailto:a@b.test|a@b.test>")).toBe("https://x.test a@b.test");
    expect(slackMarkupToText("1 &lt; 2 &amp;&amp; 3 &gt; 2")).toBe("1 < 2 && 3 > 2");
  });

  it("does not double-unescape an escaped entity", () => {
    expect(slackMarkupToText("&amp;lt;")).toBe("&lt;");
  });
});
