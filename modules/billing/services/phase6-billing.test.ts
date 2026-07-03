import { describe, expect, it } from "vitest";
import { PlanLimitExceededError, PlanEntitlementRequiredError } from "../errors/billing.errors";
import { legacyPlanLimit, megabytesToBytes } from "./usage-keys";
import { isSubscriptionWritableState } from "./subscription-writability";
import type { Plan } from "../types/billing.types";

const plan = {
  slug: "business",
  max_members: -1,
  max_tasks: 500,
  max_documents: 100,
  max_subscriptions: 25,
  max_money_transactions: 500,
  max_storage_mb: 1024,
  max_ai_calls_mo: 50,
} as Plan;

describe("Phase 6 billing helpers", () => {
  it("resolves legacy plan limits and treats -1 as unlimited", () => {
    expect(legacyPlanLimit(plan, "tasks.count")).toBe(500);
    expect(legacyPlanLimit(plan, "members.count")).toBeNull();
    expect(legacyPlanLimit(plan, "storage.bytes")).toBe(1073741824);
  });

  it("normalizes megabytes to bytes at the legacy plan boundary", () => {
    expect(megabytesToBytes(1)).toBe(1_048_576);
    expect(megabytesToBytes(1.5)).toBe(1_572_864);
  });

  it("carries structured payloads in typed billing errors", () => {
    const limitError = new PlanLimitExceededError({
      key: "documents.count",
      currentUsage: 100,
      limit: 100,
      planCode: "start",
      message: "Document limit reached",
    });
    expect(limitError.payload).toMatchObject({ key: "documents.count", limit: 100 });

    const entitlementError = new PlanEntitlementRequiredError({
      key: "developer_access.enabled",
      currentUsage: 0,
      limit: null,
      planCode: "start",
      message: "Developer access required",
    });
    expect(entitlementError.payload.planCode).toBe("start");
  });

  it("allows active and unexpired trial writes while blocking expired trials", () => {
    const now = new Date("2026-07-02T12:00:00.000Z");
    expect(isSubscriptionWritableState({ status: "active", planCode: "pro" }, now)).toBe(true);
    expect(isSubscriptionWritableState({ status: "trialing", planCode: "trial", trialEnd: "2026-07-03T00:00:00.000Z" }, now)).toBe(true);
    expect(isSubscriptionWritableState({ status: "trialing", planCode: "trial", trialEnd: "2026-07-01T00:00:00.000Z" }, now)).toBe(false);
    expect(isSubscriptionWritableState({ status: "canceled", planCode: "pro", currentPeriodEnd: "2026-07-03T00:00:00.000Z" }, now)).toBe(true);
    expect(isSubscriptionWritableState({ status: "past_due", planCode: "pro" }, now)).toBe(false);
  });
});
