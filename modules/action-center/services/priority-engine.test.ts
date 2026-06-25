import { describe, it, expect } from "vitest";
import { computePriority, mapPriority } from "./priority-engine";

const NOW = new Date("2026-06-24T12:00:00.000Z");

describe("computePriority", () => {
  it("manualOverride выигрывает у факторов", () => {
    const r = computePriority({ type: "ai_suggestion", sourceType: "ai", manualOverride: "critical" });
    expect(r.priority).toBe("critical");
  });

  it("overdue финансовая транзакция получает высокий приоритет", () => {
    const r = computePriority({
      type: "overdue",
      sourceType: "transaction",
      dueAt: "2026-06-20T00:00:00.000Z", // в прошлом
      financialImpact: 500,
      now: NOW,
    });
    // base 35 + overdue 30 + financial 25 + critical source 10 = 100 → critical
    expect(r.score).toBe(100);
    expect(r.priority).toBe("critical");
  });

  it("due within 24h добавляет 20", () => {
    const soon = computePriority({ type: "due_soon", sourceType: "task", dueAt: "2026-06-25T06:00:00.000Z", now: NOW });
    // base 20 + within24h 20 = 40 → medium
    expect(soon.score).toBe(40);
    expect(soon.priority).toBe("medium");
  });

  it("ai suggestion с низкой ценностью → info/low", () => {
    const r = computePriority({ type: "ai_suggestion", sourceType: "ai", aiConfidence: 0.5, now: NOW });
    expect(["info", "low"]).toContain(r.priority);
  });

  it("missing relation добавляет вес", () => {
    const withRel = computePriority({ type: "missing_relation", sourceType: "subscription", missingRelation: true, now: NOW });
    // base 12 + missing 10 + critical source 10 = 32 → low
    expect(withRel.score).toBe(32);
  });

  it("score клампится в [0,100]", () => {
    const r = computePriority({
      type: "overdue",
      sourceType: "transaction",
      dueAt: "2020-01-01T00:00:00.000Z",
      financialImpact: 1_000_000,
      aiConfidence: 0.99,
      missingRelation: true,
      now: NOW,
    });
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("mapPriority", () => {
  it("границы маппинга", () => {
    expect(mapPriority(95)).toBe("critical");
    expect(mapPriority(90)).toBe("critical");
    expect(mapPriority(89)).toBe("high");
    expect(mapPriority(70)).toBe("high");
    expect(mapPriority(69)).toBe("medium");
    expect(mapPriority(40)).toBe("medium");
    expect(mapPriority(39)).toBe("low");
    expect(mapPriority(10)).toBe("low");
    expect(mapPriority(9)).toBe("info");
    expect(mapPriority(0)).toBe("info");
  });
});
