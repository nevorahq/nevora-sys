import { describe, expect, it } from "vitest";
import {
  isUnusualRate,
  normalizeLocalizedRate,
  relativeRateDeviation,
  toDisplayOrganizationRate,
  toStoredOrganizationRate,
} from "./rate-convention";

describe("organization rate convention", () => {
  it("accepts a locale comma and stores the reciprocal DB convention", () => {
    expect(normalizeLocalizedRate("20,20")).toBe("20.20");
    expect(toStoredOrganizationRate("20,20")).toBe("0.0495049505");
  });

  it("presents an internal base-to-quote rate as one quote in org base", () => {
    expect(toDisplayOrganizationRate("0.0495049505")).toBeCloseTo(20.2, 8);
  });

  it("detects a factor-of-ten input while accepting a nearby manual rate", () => {
    expect(isUnusualRate(2.02, 20.1)).toBe(true);
    expect(isUnusualRate(20.2, 20.1)).toBe(false);
    expect(relativeRateDeviation(20.2, 20)).toBeCloseTo(0.01);
  });
});
