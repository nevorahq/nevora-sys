import { describe, expect, it } from "vitest";
import {
  buildCycleIdempotencyKey,
  buildSubscriptionExpenseIdempotencyKey,
  buildSubscriptionExpenseTitle,
  buildSubscriptionPaymentTaskTitle,
} from "./subscription-payment-keys";

describe("subscription payment keys", () => {
  it("builds a stable cycle idempotency key", () => {
    expect(buildCycleIdempotencyKey("sub-1", "2026-07")).toBe("subscription:sub-1:cycle:2026-07");
  });

  it("builds the expense idempotency key from the cycle id", () => {
    expect(buildSubscriptionExpenseIdempotencyKey("sub-1", "cyc-9")).toBe(
      "subscription:sub-1:cycle:cyc-9:expense",
    );
  });

  it("builds a payment task title", () => {
    expect(buildSubscriptionPaymentTaskTitle("Figma", "2026-07")).toBe(
      "Pay Figma subscription — 2026-07",
    );
  });

  it("falls back to a generic noun when the provider name is blank", () => {
    expect(buildSubscriptionPaymentTaskTitle("  ", "2026-07")).toBe(
      "Pay subscription subscription — 2026-07",
    );
  });

  it("builds an expense title", () => {
    expect(buildSubscriptionExpenseTitle("Figma", "2026-07")).toBe("Figma subscription — 2026-07");
  });
});
