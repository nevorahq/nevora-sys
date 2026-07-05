import { describe, expect, it } from "vitest";
import { createBillingPeriodKey } from "./billing-period-key";

describe("createBillingPeriodKey", () => {
  it("uses YYYY-MM for monthly", () => {
    expect(createBillingPeriodKey("2026-07-15", "monthly")).toBe("2026-07");
  });

  it("uses YYYY for yearly", () => {
    expect(createBillingPeriodKey("2026-03-01", "yearly")).toBe("2026");
  });

  it("uses the full due date for weekly so periods stay distinct", () => {
    expect(createBillingPeriodKey("2026-07-15", "weekly")).toBe("2026-07-15");
    expect(createBillingPeriodKey("2026-07-22", "weekly")).toBe("2026-07-22");
  });
});
