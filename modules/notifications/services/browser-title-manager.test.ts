import { describe, expect, it } from "vitest";
import { formatBrowserTitle, stripNotificationPrefix } from "./browser-title-manager";
import { BrowserTitleManager } from "./browser-title-manager";

describe("browser notification title", () => {
  it.each([
    [0, "Nevora Business OS"],
    [1, "(1) Nevora Business OS"],
    [99, "(99) Nevora Business OS"],
    [100, "(99+) Nevora Business OS"],
  ])("formats %s unread notifications", (count, expected) => {
    expect(formatBrowserTitle(count, "Nevora Business OS")).toBe(expected);
  });

  it("replaces an existing prefix without losing a route title", () => {
    expect(stripNotificationPrefix("(3) Tasks — Nevora Business OS")).toBe("Tasks — Nevora Business OS");
    expect(formatBrowserTitle(8, "(3) Tasks — Nevora Business OS")).toBe("(8) Tasks — Nevora Business OS");
  });

  it("prioritizes urgent obligations over unread deliveries", () => {
    expect(formatBrowserTitle(8, "Nevora Business OS", 2)).toBe("(2!) Nevora Business OS");
    expect(stripNotificationPrefix("(2!) Nevora Business OS")).toBe("Nevora Business OS");
  });

  it("tracks route title changes and restores the latest base title", () => {
    const documentRef = { title: "Tasks — Nevora Business OS" } as Document;
    const manager = new BrowserTitleManager(documentRef);
    manager.apply(3);
    expect(documentRef.title).toBe("(3) Tasks — Nevora Business OS");
    documentRef.title = "Money — Nevora Business OS";
    manager.apply(3);
    expect(documentRef.title).toBe("(3) Money — Nevora Business OS");
    manager.restore();
    expect(documentRef.title).toBe("Money — Nevora Business OS");
  });
});
