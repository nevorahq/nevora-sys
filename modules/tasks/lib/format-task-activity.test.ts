import { describe, expect, it } from "vitest";
import { formatTaskActivity, type ActivityFormatStrings } from "./format-task-activity";
import type { TaskActivityItem } from "../queries/get-task-activity";

const strings: ActivityFormatStrings = {
  created: "{actor} created",
  addedAssignee: "{actor} added {target}",
  removedAssignee: "{actor} removed {target}",
  removedSelf: "{actor} removed themselves",
  changedStatus: "{actor}: {from} -> {to}",
  changedPriority: "{actor}: {from} -> {to}",
  changedTitle: "{actor} changed title",
  changedDescription: "{actor} changed description",
  changedDueDate: "{actor} changed due date",
  changedField: "{actor} updated task",
  deleted: "{actor} deleted",
  unknownUser: "Someone",
  statuses: { todo: "Undefined", in_progress: "In progress", done: "Closed" },
  priorities: { low: "Low", medium: "Medium", high: "High" },
};

function item(overrides: Partial<TaskActivityItem>): TaskActivityItem {
  return {
    id: "log-1",
    action: "update",
    actor: { id: "actor-1", name: "Alex" },
    target: null,
    oldData: null,
    newData: null,
    createdAt: "2026-06-27T10:00:00Z",
    ...overrides,
  };
}

describe("formatTaskActivity", () => {
  it("shows who added which assignee", () => {
    expect(formatTaskActivity(item({
      action: "assign",
      target: { id: "member-1", name: "Maria" },
      newData: { assignee_id: "member-1" },
    }), strings)).toBe("Alex added Maria");
  });

  it("distinguishes self-unassignment", () => {
    expect(formatTaskActivity(item({
      action: "unassign",
      target: { id: "actor-1", name: "Alex" },
      oldData: { assignee_id: "actor-1" },
    }), strings)).toBe("Alex removed themselves");
  });

  it("formats every changed task field without inventing unchanged values", () => {
    expect(formatTaskActivity(item({
      oldData: { status: "todo", priority: "low", title: "Old" },
      newData: { status: "in_progress", priority: "high", title: "New" },
    }), strings)).toBe(
      "Alex: Undefined -> In progress · Alex: Low -> High · Alex changed title",
    );
  });

  it("falls back safely when a profile is unavailable", () => {
    expect(formatTaskActivity(item({
      action: "create",
      actor: { id: "missing", name: null },
    }), strings)).toBe("Someone created");
  });

  it("formats a dedicated status_change action with localized labels", () => {
    expect(formatTaskActivity(item({
      action: "status_change",
      oldData: { status: "todo" },
      newData: { status: "in_progress" },
    }), strings)).toBe("Alex: Undefined -> In progress");
  });

  it("formats removing another assignee", () => {
    expect(formatTaskActivity(item({
      action: "unassign",
      actor: { id: "actor-1", name: "Alex" },
      target: { id: "member-1", name: "Maria" },
      oldData: { assignee_id: "member-1" },
    }), strings)).toBe("Alex removed Maria");
  });
});
