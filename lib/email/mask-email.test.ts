import { describe, it, expect } from "vitest";
import { maskEmail } from "./mask-email";

describe("maskEmail", () => {
  it("masks the local part and lowercases", () => {
    expect(maskEmail("Jane.Doe@Example.com")).toBe("j***@example.com");
  });

  it("masks a single-char local part", () => {
    expect(maskEmail("a@x.io")).toBe("a***@x.io");
  });

  it("trims surrounding whitespace", () => {
    expect(maskEmail("  user@host.dev  ")).toBe("u***@host.dev");
  });

  it("never returns the raw local part", () => {
    const masked = maskEmail("alice.longname@corp.example");
    expect(masked).toBe("a***@corp.example");
    expect(masked).not.toContain("longname");
    expect(masked).not.toContain("alice");
  });

  it.each([null, undefined, "", "   "])("returns null for empty input %s", (raw) => {
    expect(maskEmail(raw)).toBeNull();
  });

  it.each(["notanemail", "@nolocal.com", "trailing@", "@"])(
    "fully redacts malformed input %s",
    (raw) => {
      expect(maskEmail(raw)).toBe("***");
    },
  );
});
