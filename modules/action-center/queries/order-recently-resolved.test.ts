import { describe, it, expect } from "vitest";
import { orderRecentlyResolved } from "./recently-resolved";
import type { ActionItem } from "../types/action-item.types";

function item(id: string, over: Partial<ActionItem>): ActionItem {
  return {
    id,
    organization_id: "org",
    workspace_id: null,
    title: id,
    description: null,
    type: "approval_required",
    status: "resolved",
    priority: "medium",
    priority_score: 0,
    source_type: "system",
    source_id: id,
    source_entity_type: null,
    source_entity_id: null,
    review_state: null,
    suggestion_id: null,
    relation_id: null,
    source_event_id: null,
    primary_entity_type: null,
    primary_entity_id: null,
    due_at: null,
    snoozed_until: null,
    resolved_at: null,
    dismissed_at: null,
    assigned_to: null,
    created_by: null,
    ai_generated: false,
    ai_confidence: null,
    ai_reason: null,
    metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const SINCE = "2026-07-01T00:00:00.000Z";

describe("orderRecentlyResolved", () => {
  it("queues by resolution time (last resolved first), not by created order", () => {
    const rows = [
      item("a", { status: "resolved", resolved_at: "2026-07-02T10:00:00.000Z", updated_at: "2026-07-02T10:00:00.000Z" }),
      item("c", { status: "resolved", resolved_at: "2026-07-04T10:00:00.000Z", updated_at: "2026-07-04T10:00:00.000Z" }),
      item("b", { status: "dismissed", dismissed_at: "2026-07-03T10:00:00.000Z", updated_at: "2026-07-03T10:00:00.000Z" }),
    ];
    const out = orderRecentlyResolved(rows, SINCE);
    expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("orders by resolved_at even if a later update bumped updated_at", () => {
    // 'old' was resolved long-in-window but touched most recently → updated_at is
    // newest, yet it must NOT jump above the genuinely newer resolution.
    const rows = [
      item("old", { resolved_at: "2026-07-01T12:00:00.000Z", updated_at: "2026-07-05T09:00:00.000Z" }),
      item("new", { resolved_at: "2026-07-04T12:00:00.000Z", updated_at: "2026-07-04T12:00:00.000Z" }),
    ];
    const out = orderRecentlyResolved(rows, SINCE);
    expect(out.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("excludes items whose resolution predates the window (even if recently touched)", () => {
    const rows = [
      item("stale", { resolved_at: "2026-06-20T00:00:00.000Z", updated_at: "2026-07-05T00:00:00.000Z" }),
      item("fresh", { resolved_at: "2026-07-03T00:00:00.000Z", updated_at: "2026-07-03T00:00:00.000Z" }),
    ];
    const out = orderRecentlyResolved(rows, SINCE);
    expect(out.map((r) => r.id)).toEqual(["fresh"]);
  });

  it("uses dismissed_at for dismissed items and falls back to updated_at", () => {
    const rows = [
      item("dismissed", { status: "dismissed", dismissed_at: "2026-07-04T00:00:00.000Z", updated_at: "2026-07-04T00:00:00.000Z" }),
      item("legacy", { status: "resolved", resolved_at: null, updated_at: "2026-07-02T00:00:00.000Z" }),
    ];
    const out = orderRecentlyResolved(rows, SINCE);
    expect(out.map((r) => r.id)).toEqual(["dismissed", "legacy"]);
  });

  it("keeps a deterministic newest-first queue when items entered the list at the same time", () => {
    const rows = [
      item("older", {
        resolved_at: "2026-07-04T10:00:00.000Z",
        updated_at: "2026-07-04T10:00:01.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
      }),
      item("newer", {
        resolved_at: "2026-07-04T10:00:00.000Z",
        updated_at: "2026-07-04T10:00:02.000Z",
        created_at: "2026-07-02T00:00:00.000Z",
      }),
    ];
    const out = orderRecentlyResolved(rows, SINCE);
    expect(out.map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("caps the queue at the limit", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      item(`x${i}`, { resolved_at: `2026-07-${String(2 + i).padStart(2, "0")}T00:00:00.000Z` }),
    );
    expect(orderRecentlyResolved(rows, SINCE, 10)).toHaveLength(10);
  });
});
