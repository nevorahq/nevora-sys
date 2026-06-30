import { describe, expect, it } from "vitest";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
} from "./task.constants";

describe("task statuses", () => {
  it("exposes exactly three statuses", () => {
    expect(TASK_STATUSES).toEqual(["todo", "in_progress", "done"]);
    expect(TASK_STATUSES).toHaveLength(3);
  });

  it("no longer contains legacy statuses", () => {
    expect(TASK_STATUSES).not.toContain("in_review");
    expect(TASK_STATUSES).not.toContain("cancelled");
  });

  it("has a label for every status", () => {
    for (const s of TASK_STATUSES) {
      expect(TASK_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it("treats only done as completed; todo + in_progress as active", () => {
    expect(COMPLETED_STATUSES).toEqual(["done"]);
    expect(ACTIVE_STATUSES).toEqual(["todo", "in_progress"]);
  });
});
