import { describe, expect, it } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";
import { composeDigest, DIGEST_ITEM_LIMIT } from "./compose-digest";

const copy = en.channels.telegram.digest;
const URL = "https://app.example/dashboard";

describe("composeDigest", () => {
  it("sends nothing on a day with nothing to show", () => {
    expect(composeDigest({ overdue: 0, dueToday: 0, needsAttention: 0 }, [], copy, URL)).toBeNull();
  });

  it("lists the counts and puts overdue items first", () => {
    const digest = composeDigest(
      { overdue: 1, dueToday: 1, needsAttention: 3 },
      [
        { title: "Review contract", bucket: "other" },
        { title: "Pay rent", bucket: "today" },
        { title: "Cloud storage renewal", bucket: "overdue" },
      ],
      copy,
      URL,
    );
    expect(digest).not.toBeNull();
    const lines = digest!.text.split("\n");
    expect(lines[0]).toBe(copy.title);
    expect(digest!.text).toContain("Overdue: 1");
    expect(digest!.text).toContain("Due today: 1");
    expect(digest!.text).toContain("Needs attention in total: 3");
    const items = lines.filter((line) => line.startsWith("• "));
    expect(items).toEqual(["• Cloud storage renewal — overdue", "• Pay rent — today", "• Review contract"]);
    expect(digest!.itemCount).toBe(3);
    expect(digest!.buttonUrl).toBe(URL);
  });

  it("omits zero counts and says how many items were left out", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ title: `Task ${i + 1}`, bucket: "other" as const }));
    const digest = composeDigest({ overdue: 0, dueToday: 0, needsAttention: 12 }, items, copy, URL)!;
    expect(digest.text).not.toContain("Overdue:");
    expect(digest.text).not.toContain("Due today:");
    expect(digest.text.split("\n").filter((line) => line.startsWith("• "))).toHaveLength(DIGEST_ITEM_LIMIT);
    expect(digest.text).toContain(`…and ${12 - DIGEST_ITEM_LIMIT} more in the Action Center`);
  });

  it("shortens long titles and flattens line breaks in user content", () => {
    const digest = composeDigest({ overdue: 0, dueToday: 0, needsAttention: 1 }, [{ title: `Line one\nline two ${"x".repeat(200)}`, bucket: "other" }], copy, URL)!;
    const item = digest.text.split("\n").find((line) => line.startsWith("• "))!;
    expect(item).not.toContain("\n");
    expect(item.length).toBeLessThanOrEqual(2 + 80);
    expect(item.endsWith("…")).toBe(true);
  });

  it("falls back to a link line when the URL cannot be a Telegram button", () => {
    const digest = composeDigest({ overdue: 0, dueToday: 1, needsAttention: 1 }, [], copy, "http://localhost:3000/dashboard")!;
    expect(digest.buttonUrl).toBeNull();
    expect(digest.text).toContain("Open: http://localhost:3000/dashboard");
  });

  it("speaks the user's language", () => {
    const digest = composeDigest({ overdue: 2, dueToday: 0, needsAttention: 2 }, [], ru.channels.telegram.digest, URL)!;
    expect(digest.text).toContain("Просрочено: 2");
    expect(digest.buttonLabel).toBe("Открыть Центр действий");
  });
});
