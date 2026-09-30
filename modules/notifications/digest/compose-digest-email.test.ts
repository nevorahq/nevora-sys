import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { ro } from "@/shared/i18n/dictionaries/ro";
import { composeDigestEmail } from "./compose-digest-email";

const ctx = {
  digest: en.channels.telegram.digest,
  email: en.channels.email.digest,
  locale: "en" as const,
  organizationName: "Acme & Co",
  actionCenterUrl: "https://app.example/dashboard",
  settingsUrl: "https://app.example/settings/notifications",
};

describe("composeDigestEmail", () => {
  it("sends nothing on a day with nothing to show", () => {
    expect(composeDigestEmail({ overdue: 0, dueToday: 0, needsAttention: 0 }, [], ctx)).toBeNull();
  });

  it("builds the subject, summary, ordered items and both links", () => {
    const email = composeDigestEmail(
      { overdue: 1, dueToday: 1, needsAttention: 3 },
      [
        { title: "Review contract", bucket: "other" },
        { title: "Pay rent", bucket: "today" },
        { title: "Cloud storage renewal", bucket: "overdue" },
      ],
      ctx,
    )!;
    expect(email.subject).toBe("Nevora — 3 need your attention today");
    expect(email.text).toContain("Here is what needs attention in Acme & Co today.");
    const items = email.text.split("\n").filter((line) => line.startsWith("• "));
    expect(items).toEqual(["• Cloud storage renewal — overdue", "• Pay rent — today", "• Review contract"]);
    expect(email.html).toContain('href="https://app.example/dashboard"');
    expect(email.html).toContain('href="https://app.example/settings/notifications"');
    expect(email.html).toContain('<html lang="en">');
    expect(email.settingsUrl).toBe(ctx.settingsUrl);
  });

  it("escapes user content in the HTML", () => {
    const email = composeDigestEmail(
      { overdue: 0, dueToday: 0, needsAttention: 1 },
      [{ title: '<img src=x onerror="alert(1)">', bucket: "other" }],
      { ...ctx, organizationName: "<b>Evil</b>" },
    )!;
    expect(email.html).not.toContain("<img");
    expect(email.html).not.toContain("<b>Evil</b>");
    expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(email.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });

  it("speaks the user's language", () => {
    const email = composeDigestEmail({ overdue: 2, dueToday: 0, needsAttention: 2 }, [], {
      ...ctx,
      digest: ro.channels.telegram.digest,
      email: ro.channels.email.digest,
      locale: "ro",
    })!;
    expect(email.subject).toBe("Nevora — necesită atenția ta azi: 2");
    expect(email.text).toContain("Întârziate: 2");
    expect(email.html).toContain('<html lang="ro">');
  });
});
