import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrg = vi.fn(async () => ({
  org: { id: "org-1" },
  workspace: { id: "ws-1" },
  user: { id: "user-1" },
}));
const emitDomainEvent = vi.fn(async () => undefined);
const ensureOnboardingProgress = vi.fn(async () => ({ id: "prog-1" }));
const revalidatePath = vi.fn();

let filters: Array<{ kind: string; column: string }>;
let updatedRow: unknown;

const createClient = vi.fn(async () => ({
  from: () => {
    const builder: Record<string, unknown> = {};
    builder.update = () => builder;
    builder.eq = (column: string) => {
      filters.push({ kind: "eq", column });
      return builder;
    };
    builder.is = (column: string) => {
      filters.push({ kind: "is", column });
      return builder;
    };
    builder.select = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: updatedRow, error: null });
    return builder;
  },
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("../services/ensure-onboarding-progress", () => ({ ensureOnboardingProgress }));

const { selectFirstActionAction } = await import("./select-first-action.action");

beforeEach(() => {
  vi.clearAllMocks();
  filters = [];
  updatedRow = { id: "prog-1" };
  ensureOnboardingProgress.mockResolvedValue({ id: "prog-1" });
});

describe("selectFirstActionAction", () => {
  it("rejects an action outside the four allowed first actions", async () => {
    const result = await selectFirstActionAction({ firstAction: "delete_everything" });

    expect(result).toEqual({ error: "Unknown first action" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("records the selection and starts the activation clock", async () => {
    const result = await selectFirstActionAction({ firstAction: "upload_document" });

    expect(result).toEqual({});
    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "onboarding.first_action_selected" }),
    );
  });

  /**
   * Without `source` on the event, B7's empty-state CTA rate is not merely wrong —
   * it is uncomputable, and the funnel would silently attribute every click to the
   * wizard.
   */
  it("carries the surface the click came from into the event", async () => {
    await selectFirstActionAction({ firstAction: "upload_document", source: "empty_state" });

    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { first_action: "upload_document", source: "empty_state" } }),
    );
  });

  it("defaults an unspecified surface to the wizard, where every click used to come from", async () => {
    await selectFirstActionAction({ firstAction: "create_task" });

    expect(emitDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { first_action: "create_task", source: "wizard" } }),
    );
  });

  it("rejects an unknown surface rather than recording it", async () => {
    const result = await selectFirstActionAction({ firstAction: "create_task", source: "billboard" });

    expect(result).toEqual({ error: "Unknown first action" });
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  /**
   * The B6 empty-state CTAs fire for every user, not just first-run ones. Without
   * these guards a returning user clicking "Upload a document" on an empty screen
   * would silently reopen a finished funnel and corrupt seconds_to_activation.
   */
  it("never reopens a funnel that is past the entity step, activated, or dismissed", async () => {
    await selectFirstActionAction({ firstAction: "create_task" });

    const guarded = filters.filter((f) => f.kind === "is").map((f) => f.column);
    expect(guarded).toEqual(
      expect.arrayContaining(["first_action_completed_at", "first_workflow_completed_at", "dismissed_at"]),
    );
  });

  it("treats a settled funnel as success, so the CTA still navigates", async () => {
    updatedRow = null; // the guarded UPDATE matched no row

    const result = await selectFirstActionAction({ firstAction: "add_subscription" });

    expect(result).toEqual({});
    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("fails loudly when the funnel row cannot be created", async () => {
    ensureOnboardingProgress.mockResolvedValue(null as never);

    const result = await selectFirstActionAction({ firstAction: "capture_inbox_item" });

    expect(result).toEqual({ error: "Could not start onboarding" });
  });
});
