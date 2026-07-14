import { describe, expect, it } from "vitest";
import {
  ACTIVE_ATTENTION_STATUSES,
  attentionPredicate,
  DEFAULT_ATTENTION_FILTER,
  isAttentionFilterKey,
  parseAttentionFilter,
} from "./attention-filter";

// A fixed clock so the UTC day windows are deterministic.
const NOW = new Date("2026-07-14T15:30:00.000Z");
const TODAY_START = "2026-07-14T00:00:00.000Z";
const TOMORROW_START = "2026-07-15T00:00:00.000Z";
const UPCOMING_END = "2026-07-22T00:00:00.000Z"; // today + 8 days

describe("parseAttentionFilter", () => {
  it("accepts every known key", () => {
    expect(isAttentionFilterKey("overdue")).toBe(true);
    expect(parseAttentionFilter("snoozed")).toBe("snoozed");
  });

  it("defaults an unknown or missing value to needs_attention", () => {
    expect(parseAttentionFilter("garbage")).toBe(DEFAULT_ATTENTION_FILTER);
    expect(parseAttentionFilter(undefined)).toBe("needs_attention");
    expect(parseAttentionFilter(["overdue"])).toBe("needs_attention"); // arrays are not valid
  });
});

describe("attentionPredicate — the shared count/list contract", () => {
  it("needs_attention = all active statuses, no date bound", () => {
    const p = attentionPredicate("needs_attention", NOW);
    expect(p.statuses).toEqual(ACTIVE_ATTENTION_STATUSES);
    expect(p.dueRequired).toBeUndefined();
    expect(p.dueFrom).toBeUndefined();
    expect(p.dueBefore).toBeUndefined();
  });

  it("overdue = active AND due before today (UTC)", () => {
    const p = attentionPredicate("overdue", NOW);
    expect(p.statuses).toEqual(ACTIVE_ATTENTION_STATUSES);
    expect(p.dueRequired).toBe(true);
    expect(p.dueBefore).toBe(TODAY_START);
    expect(p.dueFrom).toBeUndefined();
  });

  it("due_today = active AND due within today's UTC day", () => {
    const p = attentionPredicate("due_today", NOW);
    expect(p.dueFrom).toBe(TODAY_START);
    expect(p.dueBefore).toBe(TOMORROW_START);
  });

  it("upcoming = active AND due in the next 7 days", () => {
    const p = attentionPredicate("upcoming", NOW);
    expect(p.dueFrom).toBe(TOMORROW_START);
    expect(p.dueBefore).toBe(UPCOMING_END);
  });

  it("snoozed = snoozed status only", () => {
    expect(attentionPredicate("snoozed", NOW).statuses).toEqual(["snoozed"]);
  });

  it("recently_resolved = resolved/dismissed within a rolling 7-day window", () => {
    const p = attentionPredicate("recently_resolved", NOW);
    expect(p.statuses).toEqual(["resolved", "dismissed"]);
    expect(p.updatedFrom).toBe("2026-07-07T15:30:00.000Z"); // NOW - 7d, rolling
  });
});
