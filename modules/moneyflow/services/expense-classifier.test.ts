import { describe, expect, it } from "vitest";
import { matchSystemCategoryKey, normalizeMerchantName } from "./expense-classifier";

describe("normalizeMerchantName", () => {
  it("normalizes punctuation, accents and legal suffixes", () => {
    expect(normalizeMerchantName("  BÓLT, S.R.L. ")).toBe("bolt");
    expect(normalizeMerchantName("ACME LLC")).toBe("acme");
  });

  it("keeps multilingual merchant text deterministic", () => {
    expect(normalizeMerchantName("ООО Ромашка №12")).toBe("ромашка 12");
  });

  it("handles missing merchants", () => {
    expect(normalizeMerchantName(null)).toBe("");
  });
});

describe("matchSystemCategoryKey", () => {
  it("classifies common multilingual merchant and item signals", () => {
    expect(matchSystemCategoryKey("bolt ride")).toBe("transport");
    expect(matchSystemCategoryKey("Adobe Creative Cloud subscription")).toBe("subscriptions");
    expect(matchSystemCategoryKey("аптека здоровье")).toBe("health");
  });

  it("returns null instead of inventing a category", () => {
    expect(matchSystemCategoryKey("ambiguous merchant 123")).toBeNull();
  });
});
