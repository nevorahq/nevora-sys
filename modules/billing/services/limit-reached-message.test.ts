import { describe, expect, it, vi } from "vitest";

// billing-service imports server-only + supabase; stub those so the pure helper
// can be imported in a plain test environment.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn() },
}));

const { limitReachedMessage } = await import("./billing-service");

describe("limitReachedMessage (Phase 7.9 critical copy)", () => {
  it("includes the friendly label, current usage, and plan limit from the RPC detail", () => {
    const msg = limitReachedMessage("tasks.count", {
      message: "plan_limit_exceeded",
      details: "key=tasks.count current=50 limit=50",
    });
    expect(msg).toContain("task");
    expect(msg).toContain("50 of 50");
    expect(msg.toLowerCase()).toContain("upgrade");
  });

  it("reads the numbers from message when details is null", () => {
    const msg = limitReachedMessage("documents.count", {
      message: "plan_limit_exceeded key=documents.count current=3 limit=10",
      details: null,
    });
    expect(msg).toContain("document");
    expect(msg).toContain("3 of 10");
  });

  it("falls back to a friendly generic line when no numbers are present", () => {
    const msg = limitReachedMessage("subscriptions.count", { message: "plan_limit_exceeded" });
    expect(msg).toContain("subscription");
    expect(msg).not.toContain("of");
    expect(msg.toLowerCase()).toContain("upgrade");
  });

  it("uses the raw key as a last resort for an unknown key", () => {
    const msg = limitReachedMessage("unknown.count", { message: "plan_limit_exceeded" });
    expect(msg).toContain("unknown.count");
  });
});
