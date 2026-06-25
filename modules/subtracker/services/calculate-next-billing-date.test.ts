import { describe, expect, it } from "vitest";
import { calculateNextBillingDate } from "./calculate-next-billing-date";

describe("calculateNextBillingDate", () => {
  it("advances weekly subscriptions by seven days", () => {
    expect(calculateNextBillingDate("2026-06-24", "weekly")).toBe("2026-07-01");
  });

  it("clamps monthly renewals to the last day of a shorter month", () => {
    expect(calculateNextBillingDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("advances yearly subscriptions by one calendar year", () => {
    expect(calculateNextBillingDate("2024-02-29", "yearly")).toBe("2025-02-28");
  });
});
