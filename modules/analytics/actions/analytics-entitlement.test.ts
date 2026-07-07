import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAppAccess = vi.fn();
const accessErrorToActionResult = vi.fn();
const createClient = vi.fn();
const getDashboardMetrics = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/security", () => ({
  requireAppAccess,
  accessErrorToActionResult,
}));
vi.mock("@/lib/events", () => ({
  emitDomainEvent: vi.fn(),
  emitAuditLog: vi.fn(),
}));
vi.mock("../queries/get-dashboard-metrics", () => ({ getDashboardMetrics }));

const { createReportAction } = await import("./create-report.action");
const { createSnapshotAction } = await import("./create-snapshot.action");
const { updateWidgetAction } = await import("./update-widget.action");

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function denyWith(code: string, message: string) {
  const err = Object.assign(new Error(message), { code });
  requireAppAccess.mockRejectedValue(err);
  accessErrorToActionResult.mockImplementation((value: unknown) =>
    value === err ? { error: message } : null,
  );
}

const EXPIRED = "Your trial has ended. Choose a plan to continue editing.";

beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockResolvedValue({ from: vi.fn(), rpc: vi.fn() });
});

describe("Analytics entitlement gate", () => {
  it("denies createReportAction for an expired org before any DB write", async () => {
    denyWith("TRIAL_EXPIRED", EXPIRED);

    const result = await createReportAction(
      {},
      formData({ name: "Bypass report", reportType: "custom", parameters: "{}" }),
    );

    expect(result.error).toContain("trial has ended");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("denies createSnapshotAction for an expired org before any DB write", async () => {
    denyWith("TRIAL_EXPIRED", EXPIRED);

    const result = await createSnapshotAction(
      {},
      formData({ snapshotDate: "2026-07-07", periodType: "daily" }),
    );

    expect(result.error).toContain("trial has ended");
    expect(createClient).not.toHaveBeenCalled();
    expect(getDashboardMetrics).not.toHaveBeenCalled();
  });

  it("denies updateWidgetAction for an expired org before any DB write", async () => {
    denyWith("TRIAL_EXPIRED", EXPIRED);

    const result = await updateWidgetAction(
      {},
      formData({ widgetId: "11111111-1111-4111-8111-111111111111", name: "x" }),
    );

    expect(result.error).toContain("trial has ended");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("denies a canceled/unpaid org with the plan-required code", async () => {
    denyWith("PLAN_REQUIRED", "This action requires an active plan. Choose a plan to continue.");

    const result = await createReportAction(
      {},
      formData({ name: "Report", reportType: "custom", parameters: "{}" }),
    );

    expect(result.error).toContain("active plan");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("allows a writable org to create a report", async () => {
    requireAppAccess.mockResolvedValue({
      user: { id: "user-1" },
      org: { id: "org-1" },
      workspace: { id: "ws-1" },
      membership: { roleId: "owner" },
    });
    const single = vi.fn().mockResolvedValue({ data: { id: "report-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    createClient.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) });

    const result = await createReportAction(
      {},
      formData({ name: "Valid report", reportType: "custom", parameters: "{}" }),
    );

    expect(result).toEqual({});
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1", created_by: "user-1" }),
    );
  });
});
