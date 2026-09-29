import { describe, expect, it } from "vitest";
import {
  captureTextFromEmail,
  cleanSubject,
  hasSubstantialBody,
  htmlToText,
  isAutomated,
  isSentByOwner,
  meaningfulBody,
  readGmailForwardingConfirmation,
  type ReceivedEmail,
} from "./email-content";
import { extractAddress, findInboxToken, formatInboxAddress, generateInboxToken, sameMailbox } from "./inbound-address";

const email = (patch: Partial<ReceivedEmail>): ReceivedEmail => ({
  from: "Anna <anna@gmail.com>",
  subject: "Hello",
  text: "Body",
  html: null,
  headers: {},
  messageId: "<m1@mail.gmail.com>",
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
  ...patch,
});

describe("inbound address", () => {
  it("round-trips a generated token through the address", () => {
    const token = generateInboxToken();
    expect(token).toMatch(/^[a-km-np-z2-9]{12}$/);
    expect(findInboxToken([`Nevora <${formatInboxAddress(token, "in.nevora.app")}>`], "in.nevora.app")).toBe(token);
  });

  it("finds the token among other recipients, ignores other domains and a +tag", () => {
    expect(findInboxToken(["boss@acme.md", "inbox-abcdefghjkmn+x@IN.nevora.app"], "in.nevora.app")).toBe("abcdefghjkmn");
    expect(findInboxToken(["inbox-abcdefghjkmn@evil.app"], "in.nevora.app")).toBeNull();
    expect(findInboxToken(["inbox-short@in.nevora.app", "other@in.nevora.app"], "in.nevora.app")).toBeNull();
  });

  it("parses and compares mailboxes", () => {
    expect(extractAddress('"Anna P" <Anna.P@Example.com>')).toBe("anna.p@example.com");
    expect(extractAddress("bob@x.md")).toBe("bob@x.md");
    expect(sameMailbox("anna+work@gmail.com", "ANNA@gmail.com")).toBe(true);
    expect(sameMailbox("anna@gmail.com", "anna@outlook.com")).toBe(false);
  });
});

describe("isSentByOwner", () => {
  it("accepts a manual forward from the owner", () => {
    expect(isSentByOwner(email({}), ["anna@gmail.com"])).toBe(true);
  });

  it("refuses the owner's address when DMARC fails (spoofed)", () => {
    expect(isSentByOwner(email({ authentication: { dmarc: "fail" } }), ["anna@gmail.com"])).toBe(false);
  });

  it("accepts Gmail auto-forwarding, which keeps the original sender", () => {
    const forwarded = email({ from: "billing@vendor.md", headers: { "X-Forwarded-For": "anna@gmail.com inbox-abcdefghjkmn@in.nevora.app" } });
    expect(isSentByOwner(forwarded, ["anna@gmail.com"])).toBe(true);
  });

  it("refuses a stranger", () => {
    expect(isSentByOwner(email({ from: "spam@bad.biz" }), ["anna@gmail.com"])).toBe(false);
    expect(isSentByOwner(email({ from: "spam@bad.biz", headers: { "X-Forwarded-For": "other@gmail.com" } }), ["anna@gmail.com"])).toBe(false);
  });
});

describe("isAutomated", () => {
  it("flags auto-replies and bounces", () => {
    expect(isAutomated(email({ headers: { "Auto-Submitted": "auto-replied" } }))).toBe(true);
    expect(isAutomated(email({ from: "MAILER-DAEMON@gmail.com" }))).toBe(true);
    expect(isAutomated(email({ headers: { "auto-submitted": "no" } }))).toBe(false);
  });
});

describe("readGmailForwardingConfirmation", () => {
  it("reads the code, the link and who asked", () => {
    const confirmation = readGmailForwardingConfirmation(
      email({
        from: "Gmail Team <forwarding-noreply@google.com>",
        subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from anna@gmail.com",
        text: "To allow anna@gmail.com to forward mail, click:\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc\nConfirmation code: 123456789",
      }),
    );
    expect(confirmation).toEqual({
      code: "123456789",
      link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc",
      requestedBy: "anna@gmail.com",
    });
  });

  it("ignores any other mail", () => {
    expect(readGmailForwardingConfirmation(email({}))).toBeNull();
  });
});

describe("capture text", () => {
  it("cleans reply and forward prefixes from the subject", () => {
    expect(cleanSubject("Fwd: RE: Счёт 42")).toBe("Счёт 42");
    expect(cleanSubject("Пересл: Отв: Договор")).toBe("Договор");
  });

  it("keeps a forwarded message and drops its header block", () => {
    const body = [
      "Please handle",
      "",
      "---------- Forwarded message ---------",
      "From: Boss <boss@acme.md>",
      "Date: Mon, 28 Sep 2026",
      "Subject: Contract",
      "To: anna@gmail.com",
      "",
      "Send the signed contract by Friday.",
    ].join("\n");
    expect(meaningfulBody(body)).toBe("Please handle\n\nSend the signed contract by Friday.");
  });

  it("drops a quoted reply and a signature", () => {
    const body = "Call the bank tomorrow at 10.\n\n--\nAnna\n\nOn Mon, Sep 28, 2026 Bob wrote:\n> old text";
    expect(meaningfulBody(body)).toBe("Call the bank tomorrow at 10.");
    expect(meaningfulBody("Ok\n> quoted\nNew line")).toBe("Ok\nNew line");
  });

  it("reads HTML when there is no text part", () => {
    expect(htmlToText("<style>p{}</style><p>Pay&nbsp;rent</p><ul><li>500 EUR</li></ul>")).toBe("Pay rent\n- 500 EUR");
    expect(captureTextFromEmail(email({ subject: "Fwd: Rent", text: null, html: "<div>Pay rent by the 5th</div>" }), 4000)).toBe(
      "Rent\n\nPay rent by the 5th",
    );
  });

  it("caps the capture text", () => {
    expect(captureTextFromEmail(email({ subject: "S", text: "x".repeat(5000) }), 100)).toHaveLength(100);
  });

  it("tells a real body from a one-liner around an attachment", () => {
    expect(hasSubstantialBody(email({ text: "See attached." }))).toBe(false);
    expect(hasSubstantialBody(email({ text: "Please pay this invoice before Friday and send me the receipt." }))).toBe(true);
  });
});
