import { describe, it, expect } from "vitest";
import {
  activityKind,
  activityLabel,
  isHiddenActivityEvent,
  prettifyEventName,
} from "./format-activity-event";

describe("format-activity-event", () => {
  it("classifies create / update / delete kinds", () => {
    expect(activityKind("task.created")).toBe("create");
    expect(activityKind("money.transaction.created")).toBe("create");
    expect(activityKind("task.deleted")).toBe("delete");
    expect(activityKind("transaction.deleted")).toBe("delete");
    expect(activityKind("task.updated")).toBe("update");
    expect(activityKind("task.due_date_changed")).toBe("update");
    expect(activityKind("subscription.renewed")).toBe("update");
    expect(activityKind("member.invited")).toBe("other");
  });

  it("uses curated labels where available", () => {
    expect(activityLabel("task.deleted")).toBe("Task deleted");
    expect(activityLabel("planner_entry.created")).toBe("Inbox capture");
    expect(activityLabel("action_item.restored")).toBe("Action restored");
  });

  it("prettifies unknown events instead of showing raw names", () => {
    expect(prettifyEventName("money.transfer.created")).toBe("Money transfer created");
    expect(activityLabel("some.brand_new.event")).toBe("Some brand new event");
  });

  it("hides internal lifecycle noise", () => {
    expect(isHiddenActivityEvent("planner_entry.processing_started")).toBe(true);
    expect(isHiddenActivityEvent("document.extraction.started")).toBe(true);
    expect(isHiddenActivityEvent("action_center.item_created")).toBe(true);
    expect(isHiddenActivityEvent("task.created")).toBe(false);
  });
});
