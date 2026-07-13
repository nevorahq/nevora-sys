import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentContext } from "@/lib/context/current-context";

const emitDomainEvent = vi.fn(async () => undefined);
vi.mock("@/lib/events", () => ({ emitDomainEvent }));

const { createSourcedPlannerEntry } = await import("./create-sourced-planner-entry");

const ctx = { org: { id: "org-1" }, workspace: { id: "ws-1" }, user: { id: "user-1" } } as unknown as CurrentContext;

/**
 * Minimal chainable Supabase stub: `insert().select().single()` returns the
 * configured insert result; `select().eq()...maybeSingle()` returns the
 * configured re-read result (the 23505 reuse path).
 */
function makeSupabase(opts: { insert: { data: unknown; error: unknown }; reread?: { data: unknown } }) {
  const reread = { data: opts.reread?.data ?? null };
  const builder: Record<string, unknown> = {};
  builder.insert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(async () => opts.insert);
  builder.maybeSingle = vi.fn(async () => reread);
  return { from: vi.fn(() => builder) } as unknown as SupabaseClient;
}

const entryRow = { id: "entry-1", entry_type: "document", source: "document" };

beforeEach(() => vi.clearAllMocks());

describe("createSourcedPlannerEntry", () => {
  it("creates a document-sourced entry with the given entry type", async () => {
    const supabase = makeSupabase({ insert: { data: entryRow, error: null } });
    const result = await createSourcedPlannerEntry(supabase, ctx, {
      entity: { kind: "document", id: "doc-1" },
      summary: "Invoice",
      entryType: "photo",
      status: "processing",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reused).toBe(false);
    expect(emitDomainEvent).toHaveBeenCalledTimes(1);
  });

  it("reuses the existing entry on a unique-violation (idempotent linking)", async () => {
    const supabase = makeSupabase({
      insert: { data: null, error: { code: "23505" } },
      reread: { data: entryRow },
    });
    const result = await createSourcedPlannerEntry(supabase, ctx, {
      entity: { kind: "document", id: "doc-1" },
      summary: "Invoice",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reused).toBe(true);
      expect(result.entry.id).toBe("entry-1");
    }
    // A reused entry must NOT re-emit a creation event.
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("fails when the insert errors for a non-duplicate reason", async () => {
    const supabase = makeSupabase({ insert: { data: null, error: { code: "23502" } } });
    const result = await createSourcedPlannerEntry(supabase, ctx, {
      entity: { kind: "document", id: "doc-1" },
      summary: "Invoice",
    });
    expect(result.ok).toBe(false);
  });
});
