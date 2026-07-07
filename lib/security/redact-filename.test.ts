import { describe, expect, it } from "vitest";
import { redactFilenameForEvent } from "./redact-filename";

describe("redactFilenameForEvent", () => {
  it("redacts an email-like filename but keeps the extension", () => {
    const out = redactFilenameForEvent("john@example.com.pdf");
    expect(out).not.toContain("john@example.com");
    expect(out).not.toMatch(/@/);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("never emits the raw email even with path traversal pieces", () => {
    const out = redactFilenameForEvent("../../john@example.com.pdf");
    expect(out).not.toContain("john@example.com");
    expect(out).not.toContain("..");
    expect(out).not.toContain("/");
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("redacts an embedded email inside an otherwise useful filename", () => {
    const out = redactFilenameForEvent("invoice-for-client@example.org-2026.pdf");
    expect(out).not.toContain("client@example.org");
    expect(out).not.toMatch(/@/);
    expect(out).toContain("redacted-email");
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("leaves an ordinary filename useful and intact", () => {
    expect(redactFilenameForEvent("normal-invoice.pdf")).toBe("normal-invoice.pdf");
  });

  it("redacts a phone-like run of digits", () => {
    const out = redactFilenameForEvent("receipt-15551234567.pdf");
    expect(out).not.toContain("15551234567");
    expect(out).toContain("redacted-phone");
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("does not treat a short date as a phone number", () => {
    expect(redactFilenameForEvent("report-2026-01.pdf")).toBe("report-2026-01.pdf");
  });

  it("normalizes Windows separators and keeps only the basename", () => {
    const out = redactFilenameForEvent("C:\\Users\\jane\\secret-notes.txt");
    expect(out).toBe("secret-notes.txt");
  });

  it("strips a leading-dot / dotfile result", () => {
    const out = redactFilenameForEvent("john@example.com");
    // No safe extension → whole thing is the email → token only, no dot prefix.
    expect(out).toBe("redacted-email");
  });

  it("bounds the length", () => {
    const out = redactFilenameForEvent(`${"a".repeat(500)}.pdf`);
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it.each([
    ["", "attachment"],
    ["   ", "attachment"],
    ["../../..", "attachment"],
  ])("returns a safe fallback for unusable input %j", (input, expected) => {
    expect(redactFilenameForEvent(input)).toBe(expected);
  });

  it.each([null, undefined, 123, {}, []])(
    "returns the fallback for non-string input %j without throwing",
    (input) => {
      expect(redactFilenameForEvent(input as unknown)).toBe("attachment");
    },
  );
});
