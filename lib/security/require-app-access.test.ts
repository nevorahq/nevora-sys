import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgAccessState } from "@/modules/billing/types/entitlement.types";

/**
 * Integration tests for the gate itself. `requireOrg` (the resolved tenant
 * context), the access-state RPC and the plan-limit check are the three seams
 * the gate composes, so we mock exactly those and assert the typed AccessError
 * codes — covering the direct Server-Action bypass scenarios from the spec.
 */

const requireOrg = vi.fn();
const getOrganizationAccessState = vi.fn();
const checkPlanLimit = vi.fn();

vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/modules/billing/queries/get-organization-access-state", () => ({
  getOrganizationAccessState,
}));
vi.mock("@/lib/billing/check-limit", () => ({ checkPlanLimit }));

const { requireAppAccess } = await import("./require-app-access");
const { isAccessError } = await import("./access-errors");

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function makeContext(permissions: string[]) {
  return {
    user: { id: USER_ID, email: "owner@example.com" },
    org: { id: ORG_ID, name: "Acme", slug: "acme", plan: "trial", logoUrl: null, baseCurrency: "EUR" },
    workspace: { id: WORKSPACE_ID, name: "Main", slug: "", description: null },
    membership: { id: "m1", organizationId: ORG_ID, userId: USER_ID, roleId: "owner", status: "active", joinedAt: null },
    role: { id: "owner", name: "owner", isSystem: true, organizationId: ORG_ID },
    permissions: new Set(permissions),
  };
}

/** Assert `fn` throws an AccessError with the given code. */
async function expectCode(fn: () => Promise<unknown>, code: string) {
  await expect(fn()).rejects.toSatisfy(
    (e: unknown) => isAccessError(e) && e.code === code,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue(makeContext(["data.write"]));
  getOrganizationAccessState.mockResolvedValue("trialing" as OrgAccessState);
  checkPlanLimit.mockResolvedValue({ allowed: true });
});

describe("requireAppAccess — happy path", () => {
  it("allows write for a trialing user with the permission", async () => {
    const ctx = await requireAppAccess({ permission: "data.write", intent: "write", organizationId: ORG_ID });
    expect(ctx.org.id).toBe(ORG_ID);
    expect(ctx.accessState).toBe("trialing");
  });

  it("returns resolved context + accessState", async () => {
    const ctx = await requireAppAccess({ intent: "read" });
    expect(ctx.user.id).toBe(USER_ID);
    expect(ctx.workspace.id).toBe(WORKSPACE_ID);
  });
});

describe("requireAppAccess — tenant isolation", () => {
  it("rejects a mismatched organizationId payload", async () => {
    await expectCode(
      () => requireAppAccess({ organizationId: "deadbeef-0000-4000-8000-000000000000", permission: "data.write", intent: "write" }),
      "INVALID_TENANT_CONTEXT",
    );
  });

  it("rejects a mismatched workspaceId payload", async () => {
    await expectCode(
      () => requireAppAccess({ workspaceId: "deadbeef-0000-4000-8000-000000000000", permission: "data.write", intent: "write" }),
      "INVALID_TENANT_CONTEXT",
    );
  });

  it("accepts a matching organizationId payload", async () => {
    const ctx = await requireAppAccess({ organizationId: ORG_ID, workspaceId: WORKSPACE_ID, permission: "data.write", intent: "write" });
    expect(ctx.org.id).toBe(ORG_ID);
  });
});

describe("requireAppAccess — permissions", () => {
  it("denies a member lacking the permission", async () => {
    requireOrg.mockResolvedValue(makeContext(["data.write"])); // no billing.manage
    await expectCode(() => requireAppAccess({ permission: "billing.manage", intent: "billing" }), "PERMISSION_DENIED");
  });

  it("requires users.manage for invites", async () => {
    requireOrg.mockResolvedValue(makeContext(["data.write"])); // no users.manage
    await expectCode(() => requireAppAccess({ permission: "users.manage", intent: "invite" }), "PERMISSION_DENIED");
  });

  it("allows billing.manage when held", async () => {
    requireOrg.mockResolvedValue(makeContext(["billing.manage"]));
    const ctx = await requireAppAccess({ permission: "billing.manage", intent: "billing" });
    expect(ctx.org.id).toBe(ORG_ID);
  });
});

describe("requireAppAccess — billing entitlement", () => {
  it("denies write for a trial_expired org (TRIAL_EXPIRED)", async () => {
    getOrganizationAccessState.mockResolvedValue("trial_expired" as OrgAccessState);
    await expectCode(() => requireAppAccess({ permission: "data.write", intent: "write" }), "TRIAL_EXPIRED");
  });

  it("still allows billing on a trial_expired org", async () => {
    getOrganizationAccessState.mockResolvedValue("trial_expired" as OrgAccessState);
    requireOrg.mockResolvedValue(makeContext(["billing.manage"]));
    const ctx = await requireAppAccess({ permission: "billing.manage", intent: "billing" });
    expect(ctx.accessState).toBe("trial_expired");
  });

  it("denies invite on a past_due org (PAYMENT_PAST_DUE)", async () => {
    getOrganizationAccessState.mockResolvedValue("payment_past_due" as OrgAccessState);
    requireOrg.mockResolvedValue(makeContext(["users.manage"]));
    await expectCode(() => requireAppAccess({ permission: "users.manage", intent: "invite" }), "PAYMENT_PAST_DUE");
  });

  it("allows developer_unlimited to write", async () => {
    getOrganizationAccessState.mockResolvedValue("developer_unlimited" as OrgAccessState);
    const ctx = await requireAppAccess({ permission: "data.write", intent: "write" });
    expect(ctx.accessState).toBe("developer_unlimited");
  });
});

describe("requireAppAccess — plan capability", () => {
  it("throws LIMIT_REACHED when the metric is exhausted", async () => {
    checkPlanLimit.mockResolvedValue({ allowed: false, reason: "Plan limit reached: 50/50 tasks." });
    await expectCode(
      () => requireAppAccess({ permission: "data.write", capability: "tasks", intent: "write" }),
      "LIMIT_REACHED",
    );
  });

  it("does not check the limit for read intents", async () => {
    await requireAppAccess({ capability: "tasks", intent: "read" });
    expect(checkPlanLimit).not.toHaveBeenCalled();
  });
});
