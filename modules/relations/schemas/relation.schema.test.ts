import { describe, it, expect } from "vitest";
import {
  createRelationSchema,
  deleteRelationSchema,
  getRelationsSchema,
  searchRelationCandidatesSchema,
} from "./relation.schema";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/**
 * Первый барьер защиты relations: Zod на входе в actions/service.
 * Регрессия здесь = невалидная связь/cross-self доходит до lib и БД.
 */
describe("createRelationSchema", () => {
  it("принимает корректную кросс-модульную связь", () => {
    const r = createRelationSchema.safeParse({
      sourceEntityType: "subscription",
      sourceEntityId: A,
      targetEntityType: "document",
      targetEntityId: B,
      relationType: "contract_for_subscription",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.relationDirection).toBe("bidirectional");
  });

  it("отклоняет self-relation (один тип + один id)", () => {
    const r = createRelationSchema.safeParse({
      sourceEntityType: "task",
      sourceEntityId: A,
      targetEntityType: "task",
      targetEntityId: A,
      relationType: "related_to",
    });
    expect(r.success).toBe(false);
  });

  it("разрешает связь одного типа с разными id", () => {
    const r = createRelationSchema.safeParse({
      sourceEntityType: "task",
      sourceEntityId: A,
      targetEntityType: "task",
      targetEntityId: B,
      relationType: "related_to",
    });
    expect(r.success).toBe(true);
  });

  it("отклоняет неподдерживаемый entity type", () => {
    const r = createRelationSchema.safeParse({
      sourceEntityType: "client",
      sourceEntityId: A,
      targetEntityType: "document",
      targetEntityId: B,
      relationType: "related_to",
    });
    expect(r.success).toBe(false);
  });

  it("отклоняет неизвестный relation type", () => {
    const r = createRelationSchema.safeParse({
      sourceEntityType: "task",
      sourceEntityId: A,
      targetEntityType: "document",
      targetEntityId: B,
      relationType: "totally_made_up",
    });
    expect(r.success).toBe(false);
  });

  it("отклоняет невалидный UUID", () => {
    const r = createRelationSchema.safeParse({
      sourceEntityType: "task",
      sourceEntityId: "not-a-uuid",
      targetEntityType: "document",
      targetEntityId: B,
      relationType: "related_to",
    });
    expect(r.success).toBe(false);
  });

  it("отклоняет metadata с HTML", () => {
    const r = createRelationSchema.safeParse({
      sourceEntityType: "task",
      sourceEntityId: A,
      targetEntityType: "document",
      targetEntityId: B,
      relationType: "related_to",
      metadata: { note: "<script>alert(1)</script>" },
    });
    expect(r.success).toBe(false);
  });
});

describe("deleteRelationSchema", () => {
  it("требует валидный UUID", () => {
    expect(deleteRelationSchema.safeParse({ relationId: "x" }).success).toBe(false);
    expect(deleteRelationSchema.safeParse({ relationId: A }).success).toBe(true);
  });
});

describe("getRelationsSchema", () => {
  it("требует поддерживаемый тип и UUID", () => {
    expect(getRelationsSchema.safeParse({ entityType: "deal", entityId: A }).success).toBe(false);
    expect(getRelationsSchema.safeParse({ entityType: "subscription", entityId: A }).success).toBe(true);
  });
});

describe("searchRelationCandidatesSchema", () => {
  it("требует непустой targetTypes", () => {
    expect(searchRelationCandidatesSchema.safeParse({ targetTypes: [] }).success).toBe(false);
  });

  it("проставляет дефолты query/limit", () => {
    const r = searchRelationCandidatesSchema.safeParse({ targetTypes: ["task"] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.query).toBe("");
      expect(r.data.limit).toBe(8);
    }
  });

  it("ограничивает длину query", () => {
    const r = searchRelationCandidatesSchema.safeParse({
      targetTypes: ["task"],
      query: "x".repeat(121),
    });
    expect(r.success).toBe(false);
  });
});
