import { describe, it, expect } from "vitest";
import type { EntityLink } from "@/lib/entity-links";
import { normalizeRelation } from "./normalize-relation";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function link(partial: Partial<EntityLink>): EntityLink {
  return {
    id: "link-1",
    organization_id: "org-1",
    workspace_id: null,
    source_type: "subscription",
    source_id: A,
    target_type: "document",
    target_id: B,
    link_type: "contract_for_subscription",
    relation_direction: "bidirectional",
    metadata: {},
    created_by: "user-1",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...partial,
  };
}

describe("normalizeRelation", () => {
  it("когда сущность — source, возвращает target как other (outgoing)", () => {
    const n = normalizeRelation(link({}), "subscription", A);
    expect(n).not.toBeNull();
    expect(n?.perspective).toBe("outgoing");
    expect(n?.other).toEqual({ type: "document", id: B });
  });

  it("когда сущность — target, возвращает source как other (incoming)", () => {
    const n = normalizeRelation(link({}), "document", B);
    expect(n?.perspective).toBe("incoming");
    expect(n?.other).toEqual({ type: "subscription", id: A });
  });

  it("возвращает null, если связь не касается сущности", () => {
    expect(normalizeRelation(link({}), "task", A)).toBeNull();
  });

  it("возвращает null, если другой конец — неподдерживаемый MVP-тип", () => {
    const n = normalizeRelation(
      link({ target_type: "deal", target_id: B }),
      "subscription",
      A,
    );
    expect(n).toBeNull();
  });
});
