import { describe, it, expect } from "vitest";
import { sanitizePdfText } from "./sanitize-text";

const NUL = String.fromCharCode(0);
const VTAB = String.fromCharCode(0x0b);
const LONE_SURROGATE = String.fromCharCode(0xd800);

describe("sanitizePdfText", () => {
  it("removes NUL and other C0 control bytes that Postgres rejects", () => {
    const dirty = `Figma${NUL} ${VTAB}Pro plan`;
    expect(sanitizePdfText(dirty)).toBe("Figma Pro plan");
  });

  it("keeps tab, newline and carriage return", () => {
    const input = "a\tb\nc\rd";
    expect(sanitizePdfText(input)).toBe("a\tb\nc\rd");
  });

  it("strips lone UTF-16 surrogates", () => {
    const input = `ok${LONE_SURROGATE}end`;
    expect(sanitizePdfText(input)).toBe("okend");
  });

  it("preserves normal multibyte text", () => {
    const input = "Café — €15.00 ✓ Счёт";
    expect(sanitizePdfText(input)).toBe("Café — €15.00 ✓ Счёт");
  });
});
