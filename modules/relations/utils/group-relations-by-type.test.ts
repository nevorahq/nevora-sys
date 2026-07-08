import { describe, it, expect } from "vitest";
import { groupRelationsByType, toRelationCounts } from "./group-relations-by-type";
import type { RelatedEntity } from "../types/relation.types";

function related(type: RelatedEntity["entity"]["type"], id: string): RelatedEntity {
  return {
    relationId: `rel-${id}`,
    relationType: "related_to",
    relationStatus: "confirmed",
    relationSource: "user",
    relationDirection: "bidirectional",
    confidenceScore: null,
    perspective: "outgoing",
    metadata: {},
    createdAt: "2026-06-01T00:00:00Z",
    entity: {
      type,
      id,
      title: `${type} ${id}`,
      subtitle: null,
      status: null,
      amount: null,
      currency: null,
      href: `/x/${id}`,
    },
  };
}

describe("groupRelationsByType", () => {
  it("раскладывает связи по 4 группам и считает total", () => {
    const items = [
      related("document", "d1"),
      related("document", "d2"),
      related("transaction", "t1"),
      related("task", "k1"),
      related("subscription", "s1"),
    ];
    const grouped = groupRelationsByType(items);
    expect(grouped.documents).toHaveLength(2);
    expect(grouped.transactions).toHaveLength(1);
    expect(grouped.tasks).toHaveLength(1);
    expect(grouped.subscriptions).toHaveLength(1);
    expect(grouped.total).toBe(5);
  });

  it("пустой ввод даёт пустые группы", () => {
    const grouped = groupRelationsByType([]);
    expect(grouped.total).toBe(0);
    expect(grouped.documents).toEqual([]);
  });

  it("toRelationCounts отражает размеры групп", () => {
    const grouped = groupRelationsByType([
      related("document", "d1"),
      related("task", "k1"),
    ]);
    expect(toRelationCounts(grouped)).toEqual({
      tasks: 1,
      documents: 1,
      transactions: 0,
      subscriptions: 0,
      total: 2,
    });
  });
});
