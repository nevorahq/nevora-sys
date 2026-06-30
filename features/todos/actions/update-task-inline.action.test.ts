import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const requireOrg = vi.fn();
const emitAuditLog = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/events", () => ({ emitAuditLog }));

const { updateTaskInlineAction } = await import("./update-task-inline.action");

const TASK_ID = "44444444-4444-4444-8444-444444444444";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function builder(finalMethod: "single" | "maybeSingle", result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain[finalMethod] = vi.fn(() => Promise.resolve(result));
  return chain;
}

function makeSupabase(existing = { id: TASK_ID, title: "Old title", description: "Old description" }) {
  const fetch = builder("single", { data: existing, error: null });
  const update = builder("maybeSingle", { data: { id: TASK_ID }, error: null });
  let calls = 0;
  return {
    from: vi.fn(() => calls++ === 0 ? fetch : update),
    fetch,
    update,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({ user: { id: USER_ID }, org: { id: ORG_ID } });
  emitAuditLog.mockResolvedValue(undefined);
});

describe("updateTaskInlineAction", () => {
  it("updates only title and writes old/new activity data", async () => {
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase);

    await expect(updateTaskInlineAction(TASK_ID, "title", "  New title  ")).resolves.toEqual({ value: "New title" });

    expect(supabase.update.update).toHaveBeenCalledWith({ title: "New title", updated_by: USER_ID });
    expect(emitAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "update",
      oldData: { title: "Old title" },
      newData: { title: "New title" },
    }));
  });

  it("allows clearing description", async () => {
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase);

    await expect(updateTaskInlineAction(TASK_ID, "description", "")).resolves.toEqual({ value: "" });
    expect(supabase.update.update).toHaveBeenCalledWith({ description: "", updated_by: USER_ID });
  });

  it("rejects an empty title before loading auth or the database", async () => {
    await expect(updateTaskInlineAction(TASK_ID, "title", "   ")).resolves.toEqual({ error: "Invalid task value" });
    expect(requireOrg).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("does not write or audit an unchanged value", async () => {
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase);

    await expect(updateTaskInlineAction(TASK_ID, "title", "Old title")).resolves.toEqual({ value: "Old title" });
    expect(supabase.update.update).not.toHaveBeenCalled();
    expect(emitAuditLog).not.toHaveBeenCalled();
  });
});
