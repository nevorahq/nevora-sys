import { describe, it, expect } from "vitest";
import {
  resolveActionItemSchema,
  snoozeActionItemSchema,
  assignActionItemSchema,
  executeActionItemSchema,
} from "./action-mutation.schema";
import { actionFiltersSchema } from "./action-filters.schema";

const ID = "11111111-1111-4111-8111-111111111111";

describe("mutation schemas", () => {
  it("resolve требует валидный UUID", () => {
    expect(resolveActionItemSchema.safeParse({ actionItemId: "x" }).success).toBe(false);
    expect(resolveActionItemSchema.safeParse({ actionItemId: ID }).success).toBe(true);
  });

  it("snooze требует будущую дату", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(snoozeActionItemSchema.safeParse({ actionItemId: ID, snoozedUntil: past }).success).toBe(false);
    expect(snoozeActionItemSchema.safeParse({ actionItemId: ID, snoozedUntil: future }).success).toBe(true);
  });

  it("assign принимает null (снять назначение) и UUID", () => {
    expect(assignActionItemSchema.safeParse({ actionItemId: ID, assigneeId: null }).success).toBe(true);
    expect(assignActionItemSchema.safeParse({ actionItemId: ID, assigneeId: ID }).success).toBe(true);
    expect(assignActionItemSchema.safeParse({ actionItemId: ID, assigneeId: "x" }).success).toBe(false);
  });

  it("execute по умолчанию confirmed=false", () => {
    const r = executeActionItemSchema.safeParse({ actionItemId: ID, executeKind: "create_task_draft" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.confirmed).toBe(false);
  });
});

describe("actionFiltersSchema", () => {
  it("дефолтный limit = 20", () => {
    const r = actionFiltersSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(20);
  });

  it("отклоняет неизвестный priority", () => {
    expect(actionFiltersSchema.safeParse({ priority: ["nope"] }).success).toBe(false);
  });

  it("ограничивает limit сверху", () => {
    expect(actionFiltersSchema.safeParse({ limit: 999 }).success).toBe(false);
  });
});
