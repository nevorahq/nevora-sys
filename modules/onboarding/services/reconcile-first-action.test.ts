import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";
import type { OnboardingProgress } from "../types/onboarding.types";

interface EmittedEvent {
  eventName: string;
  payload: Record<string, unknown>;
}

// Parameters are declared so the assertions below can read `.mock.calls[i][n]`.
const emitDomainEvent = vi.fn(async (_event: EmittedEvent) => undefined);
const createSourcedPlannerEntry = vi.fn(
  async (_supabase: unknown, _ctx: unknown, _input: { entity: { kind: string; id: string }; summary: string }) => ({
    ok: true as const,
    entry: { id: "entry-1" },
  }),
);
const createPlannerSuggestion = vi.fn(
  async (_supabase: unknown, _ctx: unknown, _entryId: string, _draft: unknown) => ({
    ok: true as const,
    suggestion: { id: "draft-1" },
  }),
);

vi.mock("@/lib/events", () => ({ emitDomainEvent }));
vi.mock("@/modules/planner", () => ({ createSourcedPlannerEntry, createPlannerSuggestion }));

const { reconcileFirstAction } = await import("./reconcile-first-action");

const ctx = {
  org: { id: "org-1" },
  workspace: { id: "ws-1" },
  user: { id: "user-1" },
} as unknown as CurrentContext;

const SELECTED_AT = "2026-07-08T10:00:00.000Z";
const STARTED_AT = "2026-07-08T09:59:00.000Z";

type Row = Record<string, unknown>;

function progressRow(overrides: Partial<OnboardingProgress> = {}): OnboardingProgress {
  return {
    id: "prog-1",
    organization_id: "org-1",
    user_id: "user-1",
    selected_first_action: "upload_document",
    first_entry_id: null,
    first_draft_id: null,
    started_at: STARTED_AT,
    selected_at: SELECTED_AT,
    first_action_completed_at: null,
    first_workflow_completed_at: null,
    dismissed_at: null,
    created_at: STARTED_AT,
    updated_at: STARTED_AT,
    ...overrides,
  } as OnboardingProgress;
}

interface Filter {
  kind: "eq" | "is" | "gte" | "in";
  column: string;
  value: unknown;
}

/**
 * In-memory Supabase double. It honours `.eq()` / `.is()` / `.gte()` / `.in()` on
 * UPDATE, which is the point: the once-only seeding guarantee lives in the
 * guarded UPDATE, so a mock that ignored filters would test nothing.
 */
function makeSupabase(tables: Record<string, Row[]>) {
  const from = vi.fn((table: string) => {
    let op: "select" | "update" = "select";
    let payload: Row = {};
    let wantsRow = false;
    let orderBy: { column: string; ascending: boolean } | null = null;
    const filters: Filter[] = [];

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => {
      wantsRow = true;
      return builder;
    });
    builder.update = vi.fn((p: Row) => {
      op = "update";
      payload = p;
      return builder;
    });
    builder.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ kind: "eq", column, value });
      return builder;
    });
    builder.is = vi.fn((column: string, value: unknown) => {
      filters.push({ kind: "is", column, value });
      return builder;
    });
    builder.gte = vi.fn((column: string, value: unknown) => {
      filters.push({ kind: "gte", column, value });
      return builder;
    });
    builder.in = vi.fn((column: string, value: unknown) => {
      filters.push({ kind: "in", column, value });
      return builder;
    });
    builder.order = vi.fn((column: string, opts?: { ascending?: boolean }) => {
      orderBy = { column, ascending: opts?.ascending ?? true };
      return builder;
    });
    builder.limit = vi.fn(() => builder);

    const matches = (row: Row) =>
      filters.every((f) => {
        switch (f.kind) {
          case "eq":
            return row[f.column] === f.value;
          case "is":
            return (row[f.column] ?? null) === f.value;
          case "gte":
            return String(row[f.column]) >= String(f.value);
          case "in":
            return (f.value as unknown[]).includes(row[f.column]);
        }
      });

    const apply = () => {
      const rows = tables[table] ?? [];
      let matched = rows.filter(matches);

      if (orderBy) {
        const { column, ascending } = orderBy;
        matched = [...matched].sort((a, b) => {
          const cmp = String(a[column]).localeCompare(String(b[column]));
          return ascending ? cmp : -cmp;
        });
      }

      const hit = matched[0];
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

const AFTER = "2026-07-08T10:05:00.000Z";
const BEFORE = "2026-07-08T09:00:00.000Z";

beforeEach(() => {
  vi.clearAllMocks();
  createSourcedPlannerEntry.mockResolvedValue({ ok: true as const, entry: { id: "entry-1" } });
  createPlannerSuggestion.mockResolvedValue({ ok: true as const, suggestion: { id: "draft-1" } });
});

describe("reconcileFirstAction", () => {
  it("does nothing when no first action was selected", async () => {
    const progress = progressRow({ selected_first_action: null, selected_at: null });
    const supabase = makeSupabase({ onboarding_progress: [{ ...progress }] });

    const result = await reconcileFirstAction(supabase, ctx, progress);

    expect(result).toBe(progress);
    expect(createSourcedPlannerEntry).not.toHaveBeenCalled();
  });

  it("does nothing when the wizard was dismissed", async () => {
    const progress = progressRow({ dismissed_at: AFTER });
    const supabase = makeSupabase({ onboarding_progress: [{ ...progress }], documents: [doc()] });

    await reconcileFirstAction(supabase, ctx, progress);

    expect(createSourcedPlannerEntry).not.toHaveBeenCalled();
  });

  it("waits when the promised entity does not exist yet", async () => {
    const progress = progressRow();
    const supabase = makeSupabase({ onboarding_progress: [{ ...progress }], documents: [] });

    const result = await reconcileFirstAction(supabase, ctx, progress);

    expect(result.first_action_completed_at).toBeNull();
    expect(createSourcedPlannerEntry).not.toHaveBeenCalled();
  });

  it("ignores an entity created before the user picked the action", async () => {
    const progress = progressRow();
    const supabase = makeSupabase({
      onboarding_progress: [{ ...progress }],
      documents: [doc({ created_at: BEFORE })],
    });

    await reconcileFirstAction(supabase, ctx, progress);

    expect(createSourcedPlannerEntry).not.toHaveBeenCalled();
  });

  it("seeds a draft once the document appears and stamps the funnel", async () => {
    const progress = progressRow();
    const store = { onboarding_progress: [{ ...progress }], documents: [doc()] };
    const supabase = makeSupabase(store);

    const result = await reconcileFirstAction(supabase, ctx, progress);

    expect(createSourcedPlannerEntry).toHaveBeenCalledTimes(1);
    expect(createSourcedPlannerEntry.mock.calls[0][2]).toMatchObject({
      entity: { kind: "document", id: "doc-1" },
    });
    expect(result.first_action_completed_at).not.toBeNull();
    expect(result.first_entry_id).toBe("entry-1");
    expect(result.first_draft_id).toBe("draft-1");
  });

  it("seeds exactly one draft when two renders race", async () => {
    const progress = progressRow();
    const supabase = makeSupabase({ onboarding_progress: [{ ...progress }], documents: [doc()] });

    await Promise.all([
      reconcileFirstAction(supabase, ctx, progress),
      reconcileFirstAction(supabase, ctx, progress),
    ]);

    // The loser of the compare-and-swap must not create a second capture + draft.
    expect(createSourcedPlannerEntry).toHaveBeenCalledTimes(1);
    expect(createPlannerSuggestion).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when seeding fails, so the next visit retries", async () => {
    createSourcedPlannerEntry.mockResolvedValue({ ok: false, error: "boom" } as never);
    const progress = progressRow();
    const store = { onboarding_progress: [{ ...progress }], documents: [doc()] };
    const supabase = makeSupabase(store);

    const result = await reconcileFirstAction(supabase, ctx, progress);

    expect(result.first_action_completed_at).toBeNull();
    expect(store.onboarding_progress[0].first_action_completed_at).toBeNull();
  });

  it("does not mistake a subscription's auto-provisioned payment task for a user task", async () => {
    const progress = progressRow({ selected_first_action: "create_task" });
    const supabase = makeSupabase({
      onboarding_progress: [{ ...progress }],
      // createSubscriptionAction provisions this one; it is not what the user did.
      todos: [{ id: "todo-pay", title: "Pay Figma", organization_id: "org-1", created_by: "user-1", task_context_type: "subscription_payment", deleted_at: null, created_at: AFTER }],
      documents: [],
    });

    await reconcileFirstAction(supabase, ctx, progress);

    expect(createSourcedPlannerEntry).not.toHaveBeenCalled();
  });

  it("picks up a standard task and offers a link to the newest document", async () => {
    const progress = progressRow({ selected_first_action: "create_task" });
    const supabase = makeSupabase({
      onboarding_progress: [{ ...progress }],
      todos: [{ id: "todo-1", title: "Read the lease", organization_id: "org-1", created_by: "user-1", task_context_type: "standard", deleted_at: null, created_at: AFTER }],
      documents: [doc({ created_at: BEFORE })],
    });

    await reconcileFirstAction(supabase, ctx, progress);

    expect(createSourcedPlannerEntry).toHaveBeenCalledTimes(1);
    expect(createSourcedPlannerEntry.mock.calls[0][2]).toMatchObject({ entity: { kind: "task", id: "todo-1" } });
  });

  it("adopts the capture's own AI draft instead of seeding another", async () => {
    const progress = progressRow({ selected_first_action: "capture_inbox_item" });
    const supabase = makeSupabase({
      onboarding_progress: [{ ...progress }],
      planner_entries: [{ id: "entry-9", organization_id: "org-1", created_by: "user-1", created_at: AFTER }],
      planner_suggestions: [{ id: "draft-9", organization_id: "org-1", planner_entry_id: "entry-9", status: "pending", confidence: 0.8 }],
    });

    const result = await reconcileFirstAction(supabase, ctx, progress);

    // The Inbox already ran intent detection — seeding would double up.
    expect(createSourcedPlannerEntry).not.toHaveBeenCalled();
    expect(result.first_entry_id).toBe("entry-9");
    expect(result.first_draft_id).toBe("draft-9");
  });

  it("marks activation once the draft is confirmed, with the elapsed seconds", async () => {
    const progress = progressRow({ first_action_completed_at: AFTER, first_entry_id: "entry-1", first_draft_id: "draft-1" });
    const supabase = makeSupabase({
      onboarding_progress: [{ ...progress }],
      planner_suggestions: [{ id: "draft-1", organization_id: "org-1", status: "accepted" }],
    });

    const result = await reconcileFirstAction(supabase, ctx, progress);

    expect(result.first_workflow_completed_at).not.toBeNull();

    const activation = emitDomainEvent.mock.calls
      .map(([event]) => event)
      .find((e) => e.eventName === "onboarding.first_workflow_completed");
    expect(activation).toBeDefined();
    expect(activation!.payload.first_action).toBe("upload_document");
    expect(activation!.payload.seconds_to_activation).toBeGreaterThanOrEqual(0);
  });

  it("leaves the funnel open when the draft was rejected", async () => {
    const progress = progressRow({ first_action_completed_at: AFTER, first_draft_id: "draft-1" });
    const supabase = makeSupabase({
      onboarding_progress: [{ ...progress }],
      planner_suggestions: [{ id: "draft-1", organization_id: "org-1", status: "rejected" }],
    });

    const result = await reconcileFirstAction(supabase, ctx, progress);

    // Rejecting a suggestion is a legitimate outcome, not a failure to onboard.
    expect(result.first_workflow_completed_at).toBeNull();
  });
});

function doc(overrides: Row = {}): Row {
  return {
    id: "doc-1",
    title: "lease-agreement.pdf",
    organization_id: "org-1",
    created_by: "user-1",
    deleted_at: null,
    created_at: AFTER,
    ...overrides,
  };
}
