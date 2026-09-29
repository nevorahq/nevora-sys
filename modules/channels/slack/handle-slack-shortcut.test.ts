import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  resolve: vi.fn(),
  capture: vi.fn(),
  process: vi.fn(),
}));
vi.mock("../services/link-codes", () => ({ findActiveIntegration: mocks.find }));
vi.mock("../services/channel-context", () => ({ resolveChannelContext: mocks.resolve }));
vi.mock("../services/channel-intake", () => ({
  captureChannelText: mocks.capture,
  processChannelCapture: mocks.process,
}));

import { handleSlackShortcut } from "./handle-slack-shortcut";
import type { SlackMessageShortcut } from "./slack-payload";

const integration = { id: "i1", organization_id: "org-1", workspace_id: "ws-1", user_id: "user-1", channel: "slack" };
const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } };

function fakeSupabase(language: string | null = "ru") {
  const from = () => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.maybeSingle = async () => ({ data: { language } });
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

function shortcut(message: Partial<SlackMessageShortcut["message"]> = {}, extra: Partial<SlackMessageShortcut> = {}): SlackMessageShortcut {
  return {
    type: "message_action",
    callback_id: "send_to_nevora",
    response_url: "https://hooks.slack.com/app/T1/1/abc",
    user: { id: "U1", team_id: "T1" },
    channel: { id: "C1" },
    team: { id: "T1" },
    message: { ts: "1700000000.000100", text: "Send the report by Friday", ...message },
    ...extra,
  };
}

let replies: string[];
const deps = (language: string | null = "ru") => ({
  supabase: fakeSupabase(language),
  respond: async (text: string) => {
    replies.push(text);
    return true;
  },
  appUrl: "https://app.nevora.test",
});

beforeEach(() => {
  replies = [];
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.find.mockResolvedValue(integration);
  mocks.resolve.mockResolvedValue({ ok: true, ctx });
  mocks.capture.mockResolvedValue({ ok: true, reused: false, entry: { id: "e1", status: "captured" } });
  mocks.process.mockResolvedValue({ status: "processed", suggestions: [{ id: "s1", title: "Send the report" }] });
});

describe("handleSlackShortcut", () => {
  it("ignores a shortcut that is not ours", async () => {
    const result = await handleSlackShortcut(shortcut({}, { callback_id: "other" }), deps());
    expect(result).toEqual({ action: "ignored" });
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("captures the message into the linked user's Inbox and replies after the ack", async () => {
    const result = await handleSlackShortcut(shortcut(), deps());
    expect(result.action).toBe("captured");
    expect(mocks.find).toHaveBeenCalledWith(expect.anything(), "slack", "T1:U1");
    expect(mocks.capture).toHaveBeenCalledWith(expect.anything(), ctx, {
      channel: "slack",
      messageKey: "U1:C1:1700000000.000100",
      text: "Send the report by Friday",
    });
    // Nothing is sent to Slack before the acknowledgement.
    expect(replies).toEqual([]);
    expect(mocks.process).not.toHaveBeenCalled();

    await result.after?.();
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(replies).toEqual([
      "Добавлено во Входящие: «Send the report». Подтвердите в Nevora: https://app.nevora.test/dashboard/inbox?tab=review&suggestion=s1",
    ]);
  });

  it("keys the capture per Slack user, so teammates capturing one message each get theirs", async () => {
    await handleSlackShortcut(shortcut({}, { user: { id: "U2", team_id: "T1" } }), deps());
    expect(mocks.capture.mock.calls[0][2].messageKey).toBe("U2:C1:1700000000.000100");
  });

  it("matches a Grid org install first, then the workspace", async () => {
    mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce(integration);
    const result = await handleSlackShortcut(shortcut({}, { enterprise: { id: "E1" } }), deps());
    expect(result.action).toBe("captured");
    expect(mocks.find.mock.calls.map((call) => call[2])).toEqual(["E1:U1", "T1:U1"]);
  });

  it("asks an unknown Slack user to connect, in English, with the Settings link", async () => {
    mocks.find.mockResolvedValue(null);
    const result = await handleSlackShortcut(shortcut(), deps());
    expect(result.action).toBe("not_linked");
    expect(mocks.capture).not.toHaveBeenCalled();
    await result.after?.();
    expect(replies[0]).toContain("isn't connected to Nevora");
    expect(replies[0]).toContain("https://app.nevora.test/settings/integrations");
  });

  it("declines a message with only files, and notes skipped files next to captured text", async () => {
    const onlyFiles = await handleSlackShortcut(shortcut({ text: "", files: [{ id: "F1" }] }), deps("en"));
    expect(onlyFiles.action).toBe("media_not_supported");
    expect(mocks.capture).not.toHaveBeenCalled();
    await onlyFiles.after?.();
    expect(replies[0]).toContain("Files from Slack can't be added yet");

    replies = [];
    const withFiles = await handleSlackShortcut(shortcut({ files: [{ id: "F1" }] }), deps("en"));
    await withFiles.after?.();
    expect(replies[0]).toContain("Added to your Inbox");
    expect(replies[0]).toContain("Attached files weren't added");
  });

  it("answers an empty message without capturing", async () => {
    const result = await handleSlackShortcut(shortcut({ text: "   " }), deps("en"));
    expect(result.action).toBe("empty");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("refuses a read-only organization", async () => {
    mocks.resolve.mockResolvedValue({ ok: false, reason: "read_only" });
    const result = await handleSlackShortcut(shortcut(), deps("en"));
    expect(result.action).toBe("context_denied");
    await result.after?.();
    expect(replies[0]).toContain("read-only");
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("points a repeated message at the Inbox instead of running AI again", async () => {
    mocks.capture.mockResolvedValue({ ok: true, reused: true, entry: { id: "e1", status: "processed" } });
    const result = await handleSlackShortcut(shortcut(), deps("en"));
    expect(result.action).toBe("duplicate");
    await result.after?.();
    expect(mocks.process).not.toHaveBeenCalled();
    expect(replies[0]).toContain("already in your Inbox");
  });

  it("resumes a stored capture whose AI step never ran", async () => {
    mocks.capture.mockResolvedValue({ ok: true, reused: true, entry: { id: "e1", status: "captured" } });
    const result = await handleSlackShortcut(shortcut(), deps("en"));
    expect(result.action).toBe("duplicate");
    await result.after?.();
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });

  it("answers a storage failure instead of throwing — Slack does not redeliver", async () => {
    mocks.capture.mockResolvedValue({ ok: false, code: "failed" });
    const result = await handleSlackShortcut(shortcut(), deps("en"));
    expect(result.action).toBe("failed");
    await result.after?.();
    expect(replies[0]).toContain("wasn't saved");
  });

  it("reports the length limit", async () => {
    mocks.capture.mockResolvedValue({ ok: false, code: "too_long" });
    const result = await handleSlackShortcut(shortcut(), deps("en"));
    expect(result.action).toBe("too_long");
    await result.after?.();
    expect(replies[0]).toMatch(/up to \d+ characters/);
  });

  it("captures another app's message from its attachments", async () => {
    await handleSlackShortcut(shortcut({ text: "", attachments: [{ title: "Fix login", text: "Due Friday" }] }), deps());
    expect(mocks.capture.mock.calls[0][2].text).toBe("Fix login\nDue Friday");
  });
});
