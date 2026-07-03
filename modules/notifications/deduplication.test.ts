import { describe, expect, it } from "vitest";
import { NotificationDeduplicator } from "./deduplication";

describe("notification deduplication", () => {
  it("accepts a stable notification ID once", () => {
    const deduplicator = new NotificationDeduplicator();
    expect(deduplicator.process("notification-1")).toBe(true);
    expect(deduplicator.process("notification-1")).toBe(false);
    expect(deduplicator.process("notification-2")).toBe(true);
  });
});
