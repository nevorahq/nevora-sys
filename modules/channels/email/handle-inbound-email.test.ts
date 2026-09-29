import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  resolve: vi.fn(),
  captureText: vi.fn(),
  processText: vi.fn(),
  captureFile: vi.fn(),
  processFile: vi.fn(),
}));
vi.mock("../services/link-codes", () => ({ findActiveIntegration: mocks.find }));
vi.mock("../services/channel-context", () => ({ resolveChannelContext: mocks.resolve }));
vi.mock("../services/channel-intake", () => ({
  captureChannelText: mocks.captureText,
  processChannelCapture: mocks.processText,
  captureChannelFile: mocks.captureFile,
  processChannelFileCapture: mocks.processFile,
}));
vi.mock("../services/user-locale", () => ({ resolveUserLocale: async () => "ru" }));

import { emailMessageKey, handleInboundEmail } from "./handle-inbound-email";
import type { FetchedEmail, InboundEmailEvent } from "./resend-inbound";

const TOKEN = "abcdefghjkmn";
const integration = { id: "int-1", organization_id: "org-1", workspace_id: "ws-1", user_id: "user-1", channel: "email", external_user_id: TOKEN };
const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } };

const event = (to = [`inbox-${TOKEN}@in.nevora.app`]): InboundEmailEvent => ({
  type: "email.received",
  data: { email_id: "em-1", to, from: "anna@gmail.com", message_id: "<m1@mail.gmail.com>" },
});

const mail = (patch: Partial<FetchedEmail> = {}): FetchedEmail => ({
  from: "Anna <anna@gmail.com>",
  to: [`inbox-${TOKEN}@in.nevora.app`],
  subject: "Fwd: Contract",
  text: "Please send the signed contract to the client by Friday, and book the courier.",
  html: null,
  headers: {},
  messageId: "<m1@mail.gmail.com>",
  authentication: { dmarc: "pass" },
  attachments: [],
  ...patch,
});

let updates: unknown[];
let notices: Array<{ to: string; subject: string; text: string }>;
let downloads: string[];

function deps(email: FetchedEmail | null = mail(), owner: string | null = "anna@gmail.com") {
  const supabase = {
    from: () => {
      const builder: Record<string, unknown> = {};
      builder.update = (payload: unknown) => {
        updates.push(payload);
        return builder;
      };
      builder.eq = async () => ({ error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return {
    supabase,
    domain: "in.nevora.app",
    fetchEmail: vi.fn(async () => email),
    downloadAttachment: vi.fn(async (_emailId: string, attachmentId: string) => {
      downloads.push(attachmentId);
      return { ok: true as const, bytes: new Uint8Array([1]).buffer };
    }),
    ownerEmail: vi.fn(async () => owner),
    notify: vi.fn(async (to: string, subject: string, text: string) => {
      notices.push({ to, subject, text });
    }),
  };
}

beforeEach(() => {
  updates = [];
  notices = [];
  downloads = [];
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.find.mockResolvedValue(integration);
  mocks.resolve.mockResolvedValue({ ok: true, ctx });
  mocks.captureText.mockResolvedValue({ ok: true, entry: { id: "e1", status: "captured" }, reused: false });
  mocks.captureFile.mockResolvedValue({ ok: true, documentId: "d1", entryId: "fe1", extractionId: "x1", reused: false });
});

describe("handleInboundEmail — routing and identity", () => {
  it("ignores other events and mail not addressed to an inbox address", async () => {
    expect((await handleInboundEmail({ ...event(), type: "email.sent" }, deps())).action).toBe("ignored");
    expect((await handleInboundEmail(event(["boss@acme.md"]), deps())).action).toBe("ignored");
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("drops mail to an unknown or rotated address without answering it", async () => {
    mocks.find.mockResolvedValue(null);
    const d = deps();
    expect((await handleInboundEmail(event(), d)).action).toBe("unknown_address");
    expect(mocks.find).toHaveBeenCalledWith(expect.anything(), "email", TOKEN);
    expect(d.fetchEmail).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
  });

  it("refuses a sender that is not the owner, silently", async () => {
    const result = await handleInboundEmail(event(), deps(mail({ from: "spam@bad.biz" })));
    expect(result.action).toBe("sender_rejected");
    expect(mocks.captureText).not.toHaveBeenCalled();
    expect(notices).toEqual([]);
  });

  it("accepts Gmail automatic forwarding of a vendor's mail", async () => {
    const forwarded = mail({ from: "billing@vendor.md", headers: { "X-Forwarded-For": `anna@gmail.com inbox-${TOKEN}@in.nevora.app` } });
    expect((await handleInboundEmail(event(), deps(forwarded))).action).toBe("captured");
    // The vendor is the source a learned project rule matches.
    expect(mocks.captureText.mock.calls[0][2].signals).toEqual({ email_sender: "billing@vendor.md", email_domain: "vendor.md" });
  });

  it("stores the Gmail forwarding confirmation code for Settings instead of capturing it", async () => {
    const confirmation = mail({
      from: "forwarding-noreply@google.com",
      subject: "(#987654321) Gmail Forwarding Confirmation - Receive Mail from anna@gmail.com",
      text: "Confirmation code: 987654321",
    });
    expect((await handleInboundEmail(event(), deps(confirmation))).action).toBe("forwarding_confirmation");
    expect(updates[0]).toMatchObject({ metadata: { forwarding_confirmation: { code: "987654321", requested_by: "anna@gmail.com" } } });
    expect(mocks.captureText).not.toHaveBeenCalled();
  });

  it("never captures or answers automated mail", async () => {
    const bounce = mail({ headers: { "Auto-Submitted": "auto-replied" } });
    expect((await handleInboundEmail(event(), deps(bounce))).action).toBe("automated");
    expect(notices).toEqual([]);
  });

  it("throws when the email cannot be fetched, so Resend redelivers", async () => {
    await expect(handleInboundEmail(event(), deps(null))).rejects.toThrow();
  });
});

describe("handleInboundEmail — capture", () => {
  it("captures the subject and body as text, keyed by Message-ID, and reads it after the ack", async () => {
    const result = await handleInboundEmail(event(), deps());
    expect(result.action).toBe("captured");
    expect(mocks.captureText).toHaveBeenCalledWith(expect.anything(), ctx, {
      channel: "email",
      messageKey: "m1@mail.gmail.com",
      text: "Contract\n\nPlease send the signed contract to the client by Friday, and book the courier.",
      // The owner's own mail, nothing forwarded: no source for a project rule.
      signals: {},
    });
    expect(mocks.processText).not.toHaveBeenCalled();
    await result.after!();
    expect(mocks.processText).toHaveBeenCalledWith(expect.anything(), ctx, { id: "e1", status: "captured" });
    // Success is never answered — the Inbox is the answer.
    expect(notices).toEqual([]);
  });

  it("stores document attachments, skips inline images, and does not add a one-liner as a task", async () => {
    const withInvoice = mail({
      text: "See attached.",
      attachments: [
        { id: "logo", filename: "logo.png", contentType: "image/png", size: 100, inline: true },
        { id: "inv", filename: "invoice-42.pdf", contentType: "application/pdf", size: 20_000, inline: false },
      ],
    });
    const result = await handleInboundEmail(event(), deps(withInvoice));

    expect(downloads).toEqual(["inv"]);
    const stored = mocks.captureFile.mock.calls[0][2];
    expect(stored).toMatchObject({ channel: "email", messageKey: "m1@mail.gmail.com#inv", note: "Contract", kind: "document" });
    expect(stored.file.name).toBe("invoice-42.pdf");
    expect(mocks.captureText).not.toHaveBeenCalled();

    await result.after!();
    expect(mocks.processFile).toHaveBeenCalledWith(expect.anything(), ctx, { documentId: "d1", entryId: "fe1", extractionId: "x1" });
  });

  it("tells the owner — not the sender — about a skipped oversized attachment", async () => {
    const big = mail({
      from: "billing@vendor.md",
      headers: { "X-Forwarded-For": "anna@gmail.com" },
      attachments: [{ id: "big", filename: "scan.pdf", contentType: "application/pdf", size: 50 * 1024 * 1024, inline: false }],
    });
    await handleInboundEmail(event(), deps(big));
    expect(downloads).toEqual([]);
    expect(notices).toHaveLength(1);
    expect(notices[0].to).toBe("anna@gmail.com");
    expect(notices[0].text).toContain("«scan.pdf» больше 10 МБ");
    // The body is still captured.
    expect(mocks.captureText).toHaveBeenCalled();
  });

  it("reports a read-only organization to the owner and captures nothing", async () => {
    mocks.resolve.mockResolvedValue({ ok: false, reason: "read_only" });
    expect((await handleInboundEmail(event(), deps())).action).toBe("context_denied");
    expect(notices[0]).toMatchObject({ to: "anna@gmail.com", subject: "Nevora не смогла добавить пересланное письмо" });
    expect(notices[0].text).toContain("только для чтения");
    expect(mocks.captureText).not.toHaveBeenCalled();
  });

  it("stops at the plan limit and says so", async () => {
    mocks.captureFile.mockResolvedValue({ ok: false, code: "plan_limit" });
    const two = mail({
      attachments: [
        { id: "a", filename: "a.pdf", contentType: "application/pdf", size: 10, inline: false },
        { id: "b", filename: "b.pdf", contentType: "application/pdf", size: 10, inline: false },
      ],
    });
    await handleInboundEmail(event(), deps(two));
    expect(mocks.captureFile).toHaveBeenCalledTimes(1);
    expect(notices[0].text).toContain("лимит тарифа");
  });

  it("is a silent duplicate when everything was already stored", async () => {
    mocks.captureText.mockResolvedValue({ ok: true, entry: { id: "e1", status: "suggested" }, reused: true });
    expect(await handleInboundEmail(event(), deps())).toEqual({ action: "duplicate", after: undefined });
  });

  it("throws on a failed attachment download, so Resend redelivers", async () => {
    const d = deps(mail({ attachments: [{ id: "a", filename: "a.pdf", contentType: "application/pdf", size: 10, inline: false }] }));
    d.downloadAttachment.mockResolvedValue({ ok: false, reason: "failed" } as never);
    await expect(handleInboundEmail(event(), d)).rejects.toThrow();
  });
});

describe("emailMessageKey", () => {
  it("strips the angle brackets and hashes an unusually long id", () => {
    expect(emailMessageKey("<abc@mail.gmail.com>")).toBe("abc@mail.gmail.com");
    expect(emailMessageKey(`<${"x".repeat(300)}@y>`)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
