import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityLink } from "@/lib/entity-links";

// The @/lib/entity-links barrel re-exports "use server" actions that pull in
// lib/supabase/server (env validation), which breaks pure unit tests. The query
// under test only needs the ENTITY_LINK_COLUMNS constant from it.
vi.mock("@/lib/entity-links", () => ({
  ENTITY_LINK_COLUMNS:
    "id, organization_id, workspace_id, source_type, source_id, target_type, target_id, link_type, relation_direction, metadata, created_by, created_at, updated_at",
}));

const { fetchEntityRelations } = await import("./get-entity-relations.query");

const ORG_ID = "00000000-0000-4000-8000-000000000000";
const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Bidirectional link as written by the subscription→document attach flow:
 * subscription is source, document is target. Viewed from the document side
 * the resolver must surface the subscription (incoming perspective).
 */
function subscriptionLink(): EntityLink {
  return {
    id: "link-1",
    organization_id: ORG_ID,
    workspace_id: null,
    source_type: "subscription",
    source_id: SUBSCRIPTION_ID,
    target_type: "document",
    target_id: DOCUMENT_ID,
    link_type: "documented_by",
    relation_direction: "bidirectional",
    metadata: { source: "auto" },
    created_by: "user-1",
    created_at: "2026-06-30T00:00:00Z",
    updated_at: "2026-06-30T00:00:00Z",
  };
}

type Behavior = {
  links?: EntityLink[];
  subscriptions?: unknown[];
};

/**
 * Minimal thenable query-builder mock: every chained method returns the same
 * builder, and awaiting it resolves to the per-table dataset. Records which
 * tables were queried so we can assert no Money write path is exercised.
 */
function makeSupabase(behavior: Behavior = {}) {
  const tablesQueried: string[] = [];
  const from = vi.fn((table: string) => {
    tablesQueried.push(table);
    const resolve = () => {
      if (table === "entity_links") {
        return Promise.resolve({ data: behavior.links ?? [], error: null });
      }
      if (table === "subscriptions") {
        return Promise.resolve({ data: behavior.subscriptions ?? [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "order", "is", "in"]) {
      builder[method] = vi.fn(() => builder);
    }
    (builder as { then: unknown }).then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected: (error: unknown) => unknown,
    ) => resolve().then(onFulfilled, onRejected);
    return builder;
  });
  return { client: { from } as never, tablesQueried };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchEntityRelations", () => {
  it("resolves a subscription from the document side of a bidirectional link", async () => {
    const supabase = makeSupabase({
      links: [subscriptionLink()],
      subscriptions: [
        {
          id: SUBSCRIPTION_ID,
          name: "Cloud plan",
          amount: 12,
          currency: "EUR",
          next_billing_date: "2026-07-30",
          is_active: true,
        },
      ],
    });

    const result = await fetchEntityRelations(supabase.client, ORG_ID, "document", DOCUMENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      relationType: "documented_by",
      perspective: "incoming",
      entity: {
        type: "subscription",
        id: SUBSCRIPTION_ID,
        title: "Cloud plan",
        href: `/dashboard/subscriptions/${SUBSCRIPTION_ID}`,
      },
    });
    // Reverse navigation must never read or write the Money ledger.
    expect(supabase.tablesQueried).not.toContain("money_transactions");
  });

  it("drops the relation when the linked entity is unavailable (deleted/RLS) without crashing", async () => {
    const supabase = makeSupabase({
      links: [subscriptionLink()],
      subscriptions: [], // hydration finds nothing → link must be silently dropped
    });

    const result = await fetchEntityRelations(supabase.client, ORG_ID, "document", DOCUMENT_ID);

    expect(result).toEqual([]);
  });

  it("returns an empty list when the document has no relations", async () => {
    const supabase = makeSupabase({ links: [] });

    const result = await fetchEntityRelations(supabase.client, ORG_ID, "document", DOCUMENT_ID);

    expect(result).toEqual([]);
  });
});
