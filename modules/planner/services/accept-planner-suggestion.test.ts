import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import { PLANNER_SUGGESTION_TYPES, type PlannerSuggestion } from "../types/planner.types";
import { explainDraft } from "../utils/explain-draft";

const DOC_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";

const canDo = vi.fn((_ctx: unknown, _permission: string) => true);
// Parameters are declared so the assertions can read `.mock.calls[i][n]`.
const emitDomainEvent = vi.fn(async (_event: { eventName: string }) => undefined);
const createStandardTask = vi.fn(
  async (_supabase: unknown, _ctx: unknown, _input: { sourceSuggestionId?: string | null }) => ({
    ok: true as const,
    taskId: "task-1",
    created: true,
  }),
);
const createFinancialTask = vi.fn(async () => ({ ok: true as const, taskId: "task-1", created: true }));
interface EntityLinkInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  linkType: string;
}
// Parameter is declared so the assertions can read `.mock.calls[0][0]`.
const createEntityLink = vi.fn(async (_input: EntityLinkInput) => ({ ok: true as const, data: { id: "link-1" } }));
const createActionItemForDocument = vi.fn(async () => ({ ok: true as const, actionItemId: "ai-1" }));
const resolvePlannerActionItems = vi.fn(async () => undefined);

vi.mock("@/lib/context/current-context", () => ({ canDo }));
vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/lib/entity-links", () => ({ createEntityLink }));
vi.mock("@/modules/tasks/services/create-standard-task", () => ({ createStandardTask }));
vi.mock("@/modules/tasks/services/create-financial-task", () => ({ createFinancialTask }));
vi.mock("@/modules/action-center/services/create-action-item-for-document", () => ({
  createActionItemForDocument,
}));
vi.mock("./resolve-planner-action-item", () => ({ resolvePlannerActionItems }));

const { acceptPlannerSuggestion } = await import("./accept-planner-suggestion");

const ctx = {
  org: { id: "org-1" },
  workspace: { id: "ws-1" },
  user: { id: "user-1" },
} as unknown as CurrentContext;

type Row = Record<string, unknown>;

function baseSuggestion(overrides: Row = {}): Row {
  return {
    id: "sug-1",
    organization_id: "org-1",
    workspace_id: "ws-1",
    planner_entry_id: "entry-1",
    suggestion_type: "create_task",
    title: "Review the lease agreement",
    description: null,
    proposed_payload: {},
    confidence: 0.9,
    status: "pending",
    accepted_entity_type: null,
    accepted_entity_id: null,
    reject_reason: null,
    claimed_at: null,
    created_by: "user-1",
    owner_user_id: "user-1",
    visibility: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

interface Filter {
  kind: "eq" | "in";
  column: string;
  value: unknown;
}

interface SupabaseDoubleOptions {
  /**
   * 1-based index of the planner_suggestions UPDATE that should fail. The accept
   * path issues three: (1) claim, (2) record entity id, (3) flip to accepted.
   */
  failSuggestionUpdate?: number;
}

/**
 * In-memory Supabase double that honours `.eq()` / `.in()` filters on UPDATE.
 * That is the whole point: the once-only guarantee lives in the guarded UPDATE,
 * so a mock that ignored filters would test nothing.
 */
function makeSupabase(store: Map<string, Row>, options: SupabaseDoubleOptions = {}) {
  let suggestionUpdates = 0;

  const from = vi.fn((table: string) => {
    let op: "select" | "update" = "select";
    let payload: Row = {};
    let wantsRow = false;
    let shouldFail = false;
    const filters: Filter[] = [];

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => {
      wantsRow = true;
      return builder;
    });
    builder.update = vi.fn((p: Row) => {
      op = "update";
      payload = p;
      if (table === "planner_suggestions") {
        suggestionUpdates += 1;
        shouldFail = suggestionUpdates === options.failSuggestionUpdate;
      }
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ kind: "eq", column, value });
      return builder;
    });
    builder.in = vi.fn((column: string, value: unknown) => {
      filters.push({ kind: "in", column, value });
      return builder;
    });
    // `.is("deleted_at", null)` is a real filter, not a no-op: soft-deleted rows
    // must not satisfy a lookup that mirrors a `WHERE deleted_at IS NULL` index.
    builder.is = vi.fn((column: string, value: unknown) => {
      filters.push({ kind: "eq", column, value });
      return builder;
    });

    const matches = (row: Row) =>
      filters.every((f) =>
        f.kind === "eq" ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column]),
      );

    const apply = () => {
      if (shouldFail) return { data: null, error: { message: "connection reset" } };

      const rows = table === "planner_suggestions" ? [...store.values()] : [];
      const hit = rows.find(matches);

      if (op === "select") return { data: hit ? { ...hit } : null, error: null };

      // UPDATE: only a row that still satisfies every filter is written.
      if (!hit) return { data: null, error: null };
      Object.assign(hit, payload);
      return { data: wantsRow ? { ...hit } : null, error: null };
    };

    builder.maybeSingle = vi.fn(() => Promise.resolve(apply()));
    (builder as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(apply()).then(res, rej);

    return builder;
  });

  return { from } as unknown as SupabaseClient;
}

/**
 * As `makeSupabase`, but `entity_links` holds one active row. Models the state
 * after a crashed confirm: the link exists, so the retry's INSERT hits
 * `entity_links_unique_active_idx` and the lookup must find the survivor.
 */
function makeSupabaseWithEntityLink(store: Map<string, Row>, linkId: string): SupabaseClient {
  const base = makeSupabase(store) as unknown as { from: (t: string) => unknown };
  const from = vi.fn((table: string) => {
    if (table !== "entity_links") return base.from(table);

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: linkId }, error: null }));
    return builder;
  });

  return { from } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  canDo.mockReturnValue(true);
  createStandardTask.mockResolvedValue({ ok: true as const, taskId: "task-1", created: true });
  createEntityLink.mockResolvedValue({ ok: true as const, data: { id: "link-1" } });
});

describe("acceptPlannerSuggestion", () => {
  it("creates the entity and records it before flipping to accepted", async () => {
    const store = new Map([["sug-1", baseSuggestion()]]);
    const supabase = makeSupabase(store);

    const result = await acceptPlannerSuggestion(supabase, ctx, "sug-1");

    expect(result).toEqual({ ok: true, entityType: "task", entityId: "task-1", created: true });
    expect(createStandardTask).toHaveBeenCalledTimes(1);

    const row = store.get("sug-1")!;
    expect(row.status).toBe("accepted");
    expect(row.accepted_entity_id).toBe("task-1");
    // The claim is dropped, keeping the DB CHECK (status='processing') = (claimed_at IS NOT NULL) true.
    expect(row.claimed_at).toBeNull();
  });

  it("creates exactly one entity when two confirms race (security requirement #3)", async () => {
    const store = new Map([["sug-1", baseSuggestion()]]);
    const supabase = makeSupabase(store);

    const [first, second] = await Promise.all([
      acceptPlannerSuggestion(supabase, ctx, "sug-1"),
      acceptPlannerSuggestion(supabase, ctx, "sug-1"),
    ]);

    // Exactly one caller wins the claim; the loser never reaches a module service.
    expect(createStandardTask).toHaveBeenCalledTimes(1);

    const outcomes = [first, second];
    expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
    const loser = outcomes.find((r) => !r.ok)!;
    expect(loser).toMatchObject({ ok: false, error: "This suggestion is already being processed" });

    expect(store.get("sug-1")!.status).toBe("accepted");
  });

  it("refuses a suggestion that is already accepted", async () => {
    const store = new Map([["sug-1", baseSuggestion({ status: "accepted" })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: false, error: "Suggestion is already accepted" });
    expect(createStandardTask).not.toHaveBeenCalled();
  });

  it("releases the claim when the module service fails, leaving it retryable", async () => {
    createStandardTask.mockResolvedValue({ ok: false, error: "Task limit reached" } as never);
    const store = new Map([["sug-1", baseSuggestion({ status: "edited" })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: false, error: "Task limit reached" });
    const row = store.get("sug-1")!;
    // Reverted to the status it was claimed from — still reviewable.
    expect(row.status).toBe("edited");
    expect(row.claimed_at).toBeNull();
    expect(row.accepted_entity_id).toBeNull();
  });

  it("does NOT release the claim when the entity was created but bookkeeping failed", async () => {
    // Releasing here would invite a duplicate entity on the user's retry.
    const store = new Map([["sug-1", baseSuggestion()]]);
    // Update #2 is the write that records accepted_entity_id, right after the
    // module service created the task.
    const supabase = makeSupabase(store, { failSuggestionUpdate: 2 });

    const result = await acceptPlannerSuggestion(supabase, ctx, "sug-1");

    expect(result).toMatchObject({ ok: false, error: "Accepted, but the suggestion could not be updated" });
    expect(createStandardTask).toHaveBeenCalledTimes(1);
    // Left claimed on purpose: the reconciler decides after the timeout.
    expect(store.get("sug-1")!.status).toBe("processing");
    expect(store.get("sug-1")!.claimed_at).not.toBeNull();
  });

  it("refuses when the caller lacks the accept permission", async () => {
    canDo.mockReturnValue(false);
    const store = new Map([["sug-1", baseSuggestion()]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: false, error: "Forbidden" });
    expect(store.get("sug-1")!.status).toBe("pending");
  });
});

// ── Phase B / B3: the draft card promises effects; confirm must deliver them ──

describe("acceptPlannerSuggestion — the promised relation", () => {
  const LINK_TO = { entityType: "document", entityId: DOC_ID, linkType: "requires_action_task" };

  it("draws the document → task link a create_task draft announced", async () => {
    const store = new Map([["sug-1", baseSuggestion({ proposed_payload: { linkTo: LINK_TO } })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toMatchObject({ ok: true, entityType: "task", entityId: "task-1" });
    expect(createEntityLink).toHaveBeenCalledTimes(1);
    expect(createEntityLink.mock.calls[0][0]).toMatchObject({
      sourceType: "document",
      sourceId: DOC_ID,
      targetType: "task",
      targetId: "task-1",
      linkType: "requires_action_task",
    });
  });

  it("draws no link when the draft announced none", async () => {
    const store = new Map([["sug-1", baseSuggestion()]]);

    await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(createEntityLink).not.toHaveBeenCalled();
  });

  it("keeps the task when the link fails — retrying would duplicate the task", async () => {
    createEntityLink.mockResolvedValue({ ok: false, error: "unverifiable entity" } as never);
    const store = new Map([["sug-1", baseSuggestion({ proposed_payload: { linkTo: LINK_TO } })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toMatchObject({ ok: true });
    expect(store.get("sug-1")!.status).toBe("accepted");
  });

  it("skips the link when the caller may not create relations", async () => {
    canDo.mockImplementation((_ctx: unknown, permission: string) => permission !== "entity_link.create");
    const store = new Map([["sug-1", baseSuggestion({ proposed_payload: { linkTo: LINK_TO } })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toMatchObject({ ok: true });
    expect(createEntityLink).not.toHaveBeenCalled();
  });
});

// ── Migration 099: exactly-once survives a crash, not just a double click ──
//
// 094's claim state makes confirm at-most-once *within one process*. It cannot
// help when the process dies between "entity created" and "accepted_entity_id
// written": the reconciler sees a null witness, releases the claim to 'pending',
// and the retry runs the whole route again. These tests pin the behaviour that
// makes that retry safe — the module service resolves to the entity that already
// exists, because a UNIQUE index says it must.

describe("acceptPlannerSuggestion — exactly-once across a retried confirm", () => {
  it("passes the suggestion id as the task's idempotency key", async () => {
    const store = new Map([["sug-1", baseSuggestion()]]);

    await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    // Without this key nothing links the todo back to the draft, so migration
    // 099's todos_source_suggestion_unique_idx can never fire.
    expect(createStandardTask.mock.calls[0][2]).toMatchObject({ sourceSuggestionId: "sug-1" });
  });

  it("records the pre-existing task and does not duplicate it on retry", async () => {
    // What createStandardTask returns after it hits 23505 and re-reads the winner.
    createStandardTask.mockResolvedValue({ ok: true as const, taskId: "task-1", created: false });
    const store = new Map([["sug-1", baseSuggestion()]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: true, entityType: "task", entityId: "task-1", created: false });
    const row = store.get("sug-1")!;
    expect(row.status).toBe("accepted");
    expect(row.accepted_entity_id).toBe("task-1"); // the FIRST task, not a second one
  });

  it("does not redraw the promised link when the task already existed", async () => {
    createStandardTask.mockResolvedValue({ ok: true as const, taskId: "task-1", created: false });
    const store = new Map([
      ["sug-1", baseSuggestion({ proposed_payload: { linkTo: { entityType: "document", entityId: DOC_ID, linkType: "requires_action_task" } } })],
    ]);

    await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    // The first confirm already drew it; redrawing only logs a duplicate error.
    expect(createEntityLink).not.toHaveBeenCalled();
  });

  it("treats an already-existing entity_link as a successful confirm, not a dead end", async () => {
    // entity_links_unique_active_idx rejected the insert: the link this draft
    // promised is already there. Before 099 this returned an error, the claim was
    // released, and every retry hit the same wall — the draft could never leave
    // 'pending'.
    createEntityLink.mockResolvedValue({ ok: false, error: "Entity link already exists" } as never);

    const store = new Map([
      [
        "sug-1",
        baseSuggestion({
          suggestion_type: "link_entities",
          proposed_payload: {
            sourceType: "document",
            sourceId: DOC_ID,
            targetType: "task",
            targetId: TASK_ID,
            linkType: "requires_action_task",
          },
        }),
      ],
    ]);

    const supabase = makeSupabaseWithEntityLink(store, "link-existing");
    const result = await acceptPlannerSuggestion(supabase, ctx, "sug-1");

    expect(result).toEqual({
      ok: true,
      entityType: "entity_link",
      entityId: "link-existing",
      created: false,
    });
    expect(store.get("sug-1")!.status).toBe("accepted");
  });

  it("still fails when the link is absent and creation genuinely failed", async () => {
    createEntityLink.mockResolvedValue({ ok: false, error: "unverifiable entity" } as never);
    const store = new Map([
      [
        "sug-1",
        baseSuggestion({
          suggestion_type: "link_entities",
          proposed_payload: {
            sourceType: "document",
            sourceId: DOC_ID,
            targetType: "task",
            targetId: TASK_ID,
            linkType: "requires_action_task",
          },
        }),
      ],
    ]);

    // No existing link to fall back on.
    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: false, error: "unverifiable entity" });
    // Claim released so the user can retry once the underlying problem is fixed.
    expect(store.get("sug-1")!.status).toBe("pending");
  });

  it("refuses a second confirm of an already accepted suggestion", async () => {
    const store = new Map([["sug-1", baseSuggestion({ status: "accepted", accepted_entity_id: "task-1" })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: false, error: "Suggestion is already accepted" });
    expect(createStandardTask).not.toHaveBeenCalled();
  });

  it("refuses to confirm a rejected suggestion", async () => {
    const store = new Map([["sug-1", baseSuggestion({ status: "rejected" })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: false, error: "Suggestion is already rejected" });
    expect(createStandardTask).not.toHaveBeenCalled();
  });

  it("cannot confirm a suggestion belonging to another organization", async () => {
    const store = new Map([["sug-1", baseSuggestion({ organization_id: "org-2" })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    expect(result).toEqual({ ok: false, error: "Suggestion not found" });
    expect(createStandardTask).not.toHaveBeenCalled();
  });

  it("emits planner_suggestion.accepted exactly once per confirm", async () => {
    const store = new Map([["sug-1", baseSuggestion()]]);

    await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    const accepted = emitDomainEvent.mock.calls.filter(
      ([event]) => event.eventName === "planner_suggestion.accepted",
    );
    expect(accepted).toHaveLength(1);
  });
});

/**
 * The review panel tells the user "Nevora can't run this suggestion yet" for some
 * types. That claim is derived independently of routeAccept, so the two can drift.
 * This pins them together: a card must never promise an effect confirm refuses,
 * nor warn about one it would happily execute.
 */
describe("explainDraft().unsupported agrees with what accept actually refuses", () => {
  it.each(PLANNER_SUGGESTION_TYPES)("%s", async (suggestion_type) => {
    const store = new Map([["sug-1", baseSuggestion({ suggestion_type })]]);

    const result = await acceptPlannerSuggestion(makeSupabase(store), ctx, "sug-1");

    const refusedAsUnsupported = !result.ok && result.error.includes("isn't supported yet");
    const claimedUnsupported = explainDraft(
      baseSuggestion({ suggestion_type }) as unknown as PlannerSuggestion,
      null,
    ).unsupported;

    expect(claimedUnsupported).toBe(refusedAsUnsupported);
  });
});
