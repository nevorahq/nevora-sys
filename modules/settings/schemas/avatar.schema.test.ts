// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { avatarSchema, hasValidAvatarSignature } from "./avatar.schema";

describe("avatarSchema", () => {
  it("accepts a small supported image", async () => {
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "avatar.png",
      { type: "image/png" },
    );

    expect(avatarSchema.safeParse(png).success).toBe(true);
    expect(await hasValidAvatarSignature(png)).toBe(true);
  });

  it("rejects spoofed image contents", async () => {
    const spoofed = new File(["not an image"], "avatar.png", { type: "image/png" });

    expect(avatarSchema.safeParse(spoofed).success).toBe(true);
    expect(await hasValidAvatarSignature(spoofed)).toBe(false);
  });

  it("rejects SVG files", () => {
    const svg = new File(["<svg></svg>"], "avatar.svg", { type: "image/svg+xml" });
    expect(avatarSchema.safeParse(svg).success).toBe(false);
  });
});
