import { describe, expect, it } from "vitest";
import { generateCaptureTitle } from "./generate-capture-title";

const now = new Date("2026-07-13T10:00:00.000Z");

describe("generateCaptureTitle", () => {
  it("uses a meaningful filename as the title", () => {
    expect(generateCaptureTitle({ filename: "ACME-invoice-2026.pdf", entryType: "document", now })).toBe("ACME-invoice-2026");
  });

  it("falls back to a dated title for a generic camera-roll name", () => {
    expect(generateCaptureTitle({ filename: "IMG_2931.jpg", entryType: "photo", now })).toBe("Photo capture 2026-07-13");
    expect(generateCaptureTitle({ filename: "image.png", entryType: "photo", now })).toBe("Photo capture 2026-07-13");
  });

  it("falls back to a dated title when there is no filename", () => {
    expect(generateCaptureTitle({ filename: null, entryType: "document", now })).toBe("Document capture 2026-07-13");
    expect(generateCaptureTitle({ filename: "", entryType: "photo", now })).toBe("Photo capture 2026-07-13");
  });

  it("never requires the user to type a title (always returns something)", () => {
    expect(generateCaptureTitle({ filename: "   ", entryType: "document", now }).length).toBeGreaterThan(0);
  });

  it("caps very long filenames under the upload schema limit", () => {
    const long = `${"a".repeat(400)}.pdf`;
    expect(generateCaptureTitle({ filename: long, entryType: "document", now }).length).toBeLessThanOrEqual(160);
  });
});
