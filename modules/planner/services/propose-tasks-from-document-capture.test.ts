import { beforeEach, describe, expect, it, vi } from "vitest";

const { detectPlannerIntent, createPlannerSuggestion, loadProjectCandidates } = vi.hoisted(() => ({
  detectPlannerIntent: vi.fn(),
  createPlannerSuggestion: vi.fn(),
  loadProjectCandidates: vi.fn(),
}));
vi.mock("./detect-planner-intent", () => ({ detectPlannerIntent }));
vi.mock("./create-planner-suggestion", () => ({ createPlannerSuggestion }));
vi.mock("./load-project-candidates", () => ({ loadProjectCandidates }));
vi.mock("./project-rules", () => ({ loadEntrySignals: async () => ({}), matchProjectRule: async () => null }));
vi.mock("server-only", () => ({}));

import { proposeTasksFromDocumentCapture } from "./propose-tasks-from-document-capture";
import type { PlannerEntry } from "../types/planner.types";

const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } } as never;
const capture = { id: "entry-1" } as PlannerEntry;

function makeSupabase(existingDrafts: number) {
  const updates: Record<string, unknown>[] = [];
  const supabase = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      chain.eq = () => chain;
      chain.select = () => chain;
      chain.update = (patch: Record<string, unknown>) => {
        updates.push({ table, ...patch });
        return chain;
      };
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ count: table === "planner_suggestions" ? existingDrafts : null, error: null }).then(resolve);
      return chain;
    },
  };
  return { supabase: supabase as never, updates };
}

const task = (title: string) => ({ suggestionType: "create_task", title, proposedPayload: { title }, confidence: 0.8 });

beforeEach(() => {
  vi.clearAllMocks();
  createPlannerSuggestion.mockResolvedValue({ ok: true, suggestion: {} });
  loadProjectCandidates.mockResolvedValue([{ id: "project-1", name: "Lease" }]);
});

describe("proposeTasksFromDocumentCapture", () => {
  it("attaches one draft per action the document asks for, read in document mode", async () => {
    detectPlannerIntent.mockResolvedValue({
      detectedIntent: "lease",
      confidence: 0.9,
      suggestions: [task("Sign the lease"), task("Call the notary")],
    });
    const { supabase, updates } = makeSupabase(0);

    const created = await proposeTasksFromDocumentCapture(supabase, ctx, capture, "Sign the lease. Call the notary.");

    expect(created).toBe(2);
    expect(detectPlannerIntent).toHaveBeenCalledWith("Sign the lease. Call the notary.", {
      source: "document",
      projects: [{ id: "project-1", name: "Lease" }],
    });
    expect(createPlannerSuggestion).toHaveBeenCalledTimes(2);
    expect(createPlannerSuggestion).toHaveBeenCalledWith(supabase, ctx, "entry-1", expect.anything());
    expect(updates[0]).toMatchObject({ table: "planner_entries", ai_detected_intent: "lease" });
  });

  it("does not stack a second set of drafts when the extraction is retried", async () => {
    const { supabase } = makeSupabase(2);

    const created = await proposeTasksFromDocumentCapture(supabase, ctx, capture, "Sign the lease.");

    expect(created).toBe(2);
    expect(detectPlannerIntent).not.toHaveBeenCalled();
    expect(createPlannerSuggestion).not.toHaveBeenCalled();
  });

  it("reports zero when the document asks for nothing", async () => {
    detectPlannerIntent.mockResolvedValue({ detectedIntent: "no_action", confidence: 0, suggestions: [] });
    const { supabase, updates } = makeSupabase(0);

    await expect(proposeTasksFromDocumentCapture(supabase, ctx, capture, "Menu")).resolves.toBe(0);
    expect(updates).toHaveLength(0);
  });
});
