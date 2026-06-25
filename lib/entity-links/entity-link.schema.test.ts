import { describe, it, expect } from "vitest";
import {
  createEntityLinkSchema,
  getEntityLinksSchema,
  deleteEntityLinkSchema,
} from "./entity-link.schema";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/**
 * entity_links — валидация на уровне формы (первый из трёх барьеров:
 * Zod → self-link guard → RLS). Регрессия здесь = мусор доходит до БД.
 */
describe("createEntityLinkSchema", () => {
  it("принимает корректную связь и проставляет linkType по умолчанию", () => {
    const r = createEntityLinkSchema.safeParse({
      sourceType: "document",
      sourceId: A,
      targetType: "transaction",
      targetId: B,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.linkType).toBe("related");
  });

  it("отклоняет self-link (одинаковый type+id)", () => {
    const r = createEntityLinkSchema.safeParse({
      sourceType: "task",
      sourceId: A,
      targetType: "task",
      targetId: A,
    });
    expect(r.success).toBe(false);
  });

  it("разрешает связь одинаковых типов с разными id", () => {
    const r = createEntityLinkSchema.safeParse({
      sourceType: "task",
      sourceId: A,
      targetType: "task",
      targetId: B,
    });
    expect(r.success).toBe(true);
  });

  it("отклоняет невалидный UUID", () => {
    const r = createEntityLinkSchema.safeParse({
      sourceType: "document",
      sourceId: "not-a-uuid",
      targetType: "transaction",
      targetId: B,
    });
    expect(r.success).toBe(false);
  });

  it("отклоняет неизвестный link_type", () => {
    const r = createEntityLinkSchema.safeParse({
      sourceType: "document",
      sourceId: A,
      targetType: "transaction",
      targetId: B,
      linkType: "totally_unknown",
    });
    expect(r.success).toBe(false);
  });

  it("отклоняет пустой type", () => {
    const r = createEntityLinkSchema.safeParse({
      sourceType: "",
      sourceId: A,
      targetType: "transaction",
      targetId: B,
    });
    expect(r.success).toBe(false);
  });
});

describe("getEntityLinksSchema", () => {
  it("требует source или target", () => {
    expect(getEntityLinksSchema.safeParse({}).success).toBe(false);
  });

  it("принимает только source", () => {
    const r = getEntityLinksSchema.safeParse({
      source: { type: "document", id: A },
    });
    expect(r.success).toBe(true);
  });
});

describe("deleteEntityLinkSchema", () => {
  it("требует валидный UUID", () => {
    expect(deleteEntityLinkSchema.safeParse({ id: "x" }).success).toBe(false);
    expect(deleteEntityLinkSchema.safeParse({ id: A }).success).toBe(true);
  });
});
