import { describe, expect, it } from "vitest";
import { signSubscriptionsServiceToken, verifySubscriptionsServiceToken } from "./service-auth";

const SECRET = "a-secure-subscriptions-service-secret-1";
const context = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write", "billing.manage"],
};

describe("Subscriptions service identity", () => {
  it("round-trips bounded claims and drops unrelated permissions", () => {
    const token = signSubscriptionsServiceToken({
      context,
      operation: "createSubscriptionPaymentTaskForCycle",
      now: 1_800_000_000,
      nonce: "44444444-4444-4444-8444-444444444444",
    }, SECRET);

    const result = verifySubscriptionsServiceToken(token, SECRET, "createSubscriptionPaymentTaskForCycle", 1_800_000_030);
    expect(result).toMatchObject({
      ok: true,
      claims: {
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        subject: context.actorId,
        permissions: ["org.read", "data.write"],
        operation: "createSubscriptionPaymentTaskForCycle",
      },
    });
  });

  it("rejects tampering and operation replay", () => {
    const token = signSubscriptionsServiceToken({ context, operation: "getSubscriptions", now: 1_800_000_000 }, SECRET);
    expect(verifySubscriptionsServiceToken(`${token}x`, SECRET, "getSubscriptions", 1_800_000_010)).toMatchObject({ ok: false });
    expect(verifySubscriptionsServiceToken(token, SECRET, "getPaymentCycleByTaskId", 1_800_000_010)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects expired tokens and weak secrets", () => {
    const token = signSubscriptionsServiceToken({ context, operation: "getSubscriptions", now: 1_800_000_000 }, SECRET);
    expect(verifySubscriptionsServiceToken(token, SECRET, "getSubscriptions", 1_800_000_061)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(() => signSubscriptionsServiceToken({ context, operation: "getSubscriptions" }, "weak")).toThrow(/at least 32/);
  });
});
