import { describe, it, expect } from "vitest";
import { applyTaskSort } from "./apply-task-sort";
import { parseTaskSort } from "../schemas/task-sort.schema";
import { TASK_SORTS } from "../constants/task-sort.constants";

/**
 * Records every .order() call so we can assert the exact column/direction
 * sequence each sort mode produces — the encoded source of truth for ordering.
 */
function mockQuery() {
  const calls: { column: string; ascending: boolean; nullsFirst?: boolean }[] = [];
  const builder = {
    calls,
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
      calls.push({
        column,
        ascending: options?.ascending ?? true,
        nullsFirst: options?.nullsFirst,
      });
      return builder;
    },
  };
  return builder;
}

describe("parseTaskSort", () => {
  it("defaults to smart_default for missing input", () => {
    expect(parseTaskSort(undefined)).toBe("smart_default");
    expect(parseTaskSort(null)).toBe("smart_default");
    expect(parseTaskSort("")).toBe("smart_default");
  });

  it("falls back to smart_default for an invalid / injection-y value", () => {
    expect(parseTaskSort("created_at; DROP TABLE todos;")).toBe("smart_default");
    expect(parseTaskSort("priority")).toBe("smart_default");
    expect(parseTaskSort(42)).toBe("smart_default");
  });

  it("accepts every whitelisted sort", () => {
    for (const sort of TASK_SORTS) {
      expect(parseTaskSort(sort)).toBe(sort);
    }
  });
});

describe("applyTaskSort", () => {
  it("smart_default orders overdue-active first, closed last, then priority/due/recency", () => {
    const q = mockQuery();
    applyTaskSort(q, "smart_default");
    expect(q.calls.map((c) => c.column)).toEqual([
      "sort_overdue",
      "is_closed",
      "priority_weight",
      "due_date",
      "created_at",
    ]);
    // overdue + closed + priority ascending; due_date asc NULLS LAST; recency desc
    expect(q.calls[0]).toMatchObject({ column: "sort_overdue", ascending: true });
    expect(q.calls[3]).toMatchObject({ column: "due_date", ascending: true, nullsFirst: false });
    expect(q.calls[4]).toMatchObject({ column: "created_at", ascending: false });
  });

  it("priority_desc puts highest priority first", () => {
    const q = mockQuery();
    applyTaskSort(q, "priority_desc");
    expect(q.calls.map((c) => c.column)).toEqual(["priority_weight", "due_date", "created_at"]);
    expect(q.calls[0]).toMatchObject({ column: "priority_weight", ascending: true });
  });

  it("due_date_asc sorts earliest first with NULLs last", () => {
    const q = mockQuery();
    applyTaskSort(q, "due_date_asc");
    expect(q.calls[0]).toMatchObject({ column: "due_date", ascending: true, nullsFirst: false });
  });

  it("created_at modes sort purely by recency direction", () => {
    const desc = mockQuery();
    applyTaskSort(desc, "created_at_desc");
    expect(desc.calls).toEqual([{ column: "created_at", ascending: false, nullsFirst: undefined }]);

    const asc = mockQuery();
    applyTaskSort(asc, "created_at_asc");
    expect(asc.calls).toEqual([{ column: "created_at", ascending: true, nullsFirst: undefined }]);
  });
});
