import { describe, expect, it } from "vitest";
import { publishDomainEventSchema } from "./domain-event.schema";

const base = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  eventName: "task.created",
  aggregateType: "task",
  aggregateId: "22222222-2222-4222-8222-222222222222",
  payload: {},
};

describe("publishDomainEventSchema", () => {
  it("accepts a Phase 1 event", () => {
    expect(publishDomainEventSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an unknown event name", () => {
    expect(publishDomainEventSchema.safeParse({ ...base, eventName: "task.magic" }).success).toBe(false);
  });

  it("rejects an oversized payload", () => {
    expect(publishDomainEventSchema.safeParse({ ...base, payload: { text: "x".repeat(16_001) } }).success).toBe(false);
  });
});
