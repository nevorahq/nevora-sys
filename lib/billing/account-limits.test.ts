import { describe, expect, it } from "vitest";
import { buildAccountLimits } from "./account-limits";

const plan = {
  max_workspaces: 1,
  max_members: 3,
  max_tasks: 100,
  max_clients: 50,
  max_deals: 50,
  max_documents: 20,
  max_subscriptions: 100,
  max_money_transactions: 1000,
  max_storage_mb: 100,
  max_ai_calls_mo: 10,
};

describe("buildAccountLimits", () => {
  it("keeps plan quotas for a regular account", () => {
    expect(buildAccountLimits(
      { account_role: "user", unlimited_access: false },
      plan,
    )).toMatchObject({
      maxWorkspaces: 1,
      maxTasks: 100,
      maxAiRequestsPerMonth: 10,
      unlimitedAccess: false,
      accountRole: "user",
    });
  });

  it("returns null product limits for an unlimited developer account", () => {
    const limits = buildAccountLimits(
      { account_role: "developer", unlimited_access: true },
      plan,
    );

    expect(limits.unlimitedAccess).toBe(true);
    expect(Object.entries(limits).filter(([key]) => key.startsWith("max")))
      .toSatisfy((entries: [string, unknown][]) => entries.every(([, value]) => value === null));
  });

  it("does not grant unlimited access from the role alone", () => {
    expect(buildAccountLimits(
      { account_role: "developer", unlimited_access: false },
      plan,
    ).unlimitedAccess).toBe(false);
  });

  it("preserves legacy unlimited plan values", () => {
    expect(buildAccountLimits(null, { ...plan, max_documents: -1 }).maxDocuments).toBeNull();
  });
});
