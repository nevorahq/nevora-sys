import { describe, expect, it } from "vitest";
import { signTasksServiceToken, verifyTasksServiceToken } from "./service-auth";

const SECRET = "a-secure-tasks-service-secret-value-123";
const context = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  actorId: "33333333-3333-4333-8333-333333333333",
  permissions: ["org.read", "data.write", "billing.manage"],
};

describe("Tasks service identity", () => {
  it("round-trips bounded claims and drops unrelated permissions", () => {
    const token = signTasksServiceToken({
      context,
      operation: "createGeneratedTask",
      now: 1_800_000_000,
      nonce: "44444444-4444-4444-8444-444444444444",
    }, SECRET);

    const result = verifyTasksServiceToken(token, SECRET, "createGeneratedTask", 1_800_000_030);
    expect(result).toMatchObject({
      ok: true,
      claims: {
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        subject: context.actorId,
        permissions: ["org.read", "data.write"],
        operation: "createGeneratedTask",
      },
    });
  });

  it("rejects tampering and operation replay", () => {
    const token = signTasksServiceToken({ context, operation: "getTask", now: 1_800_000_000 }, SECRET);
    expect(verifyTasksServiceToken(`${token}x`, SECRET, "getTask", 1_800_000_010)).toMatchObject({ ok: false });
    expect(verifyTasksServiceToken(token, SECRET, "createStandardTask", 1_800_000_010)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects expired tokens and weak secrets", () => {
    const token = signTasksServiceToken({ context, operation: "listTasks", now: 1_800_000_000 }, SECRET);
    expect(verifyTasksServiceToken(token, SECRET, "listTasks", 1_800_000_061)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(() => signTasksServiceToken({ context, operation: "listTasks" }, "weak")).toThrow(/at least 32/);
  });
});
