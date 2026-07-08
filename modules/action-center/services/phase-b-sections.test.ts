import { describe, expect, it } from "vitest";
import { ACTION_ITEM_TYPES, type ActionItemType } from "../types/action-item.types";
import type { ActionFeedItem, ActionFeedSections } from "../types/action-center.types";
import { groupPhaseBSections, phaseBRank, phaseBSectionOf } from "./phase-b-sections";

function item(overrides: Partial<ActionFeedItem> & { id: string; type: ActionItemType }): ActionFeedItem {
  return {
    organization_id: "org-1",
    workspace_id: null,
    title: overrides.id,
    description: null,
    status: "open",
    priority: "medium",
    priority_score: 50,
    source_type: "system",
    source_id: "src-1",
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
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    assignee_name: null,
    related_count: 0,
    ...overrides,
  } as ActionFeedItem;
}

/** The query's transport shape: everything active lands in one of four buckets. */
function sections(active: ActionFeedItem[], resolved: ActionFeedItem[] = []): ActionFeedSections {
  return {
    due_soon: active,
    waiting_for_action: [],
    missing_information: [],
    ai_suggestions: [],
    recently_resolved: resolved,
  };
}

describe("phase-b section mapping", () => {
  it("places every action item type — a new type cannot vanish from the screen", () => {
    for (const type of ACTION_ITEM_TYPES) {
      expect(["needs_your_review", "next_actions"]).toContain(phaseBSectionOf(type));
      expect(phaseBRank(type)).toBeGreaterThanOrEqual(1);
      expect(phaseBRank(type)).toBeLessThanOrEqual(5);
    }
  });

  it("routes decisions to review and work to next actions", () => {
    const review: ActionItemType[] = [
      "approval_required",
      "draft_review",
      "ai_suggestion",
      "risk_detected",
      "missing_information",
      "missing_relation",
      "assignment_required",
    ];
    const work: ActionItemType[] = [
      "overdue",
      "payment_required",
      "renewal_required",
      "due_soon",
      "document_review",
      "follow_up_required",
    ];

    for (const type of review) expect(phaseBSectionOf(type)).toBe("needs_your_review");
    for (const type of work) expect(phaseBSectionOf(type)).toBe("next_actions");
  });

  it("ranks a confirmable draft above everything else", () => {
    expect(phaseBRank("ai_suggestion")).toBe(1);
    expect(phaseBRank("draft_review")).toBe(1);
    expect(phaseBRank("approval_required")).toBe(1);

    // Late money outranks a stale capture, which outranks an unlinked object.
    expect(phaseBRank("overdue")).toBeLessThan(phaseBRank("missing_information"));
    expect(phaseBRank("payment_required")).toBeLessThan(phaseBRank("missing_information"));
    expect(phaseBRank("missing_information")).toBeLessThan(phaseBRank("missing_relation"));
    expect(phaseBRank("missing_relation")).toBeLessThan(phaseBRank("due_soon"));
  });
});

describe("groupPhaseBSections", () => {
  it("puts the draft first even when a stale capture scores higher", () => {
    const grouped = groupPhaseBSections(
      sections([
        item({ id: "capture", type: "missing_information", priority_score: 99 }),
        item({ id: "draft", type: "ai_suggestion", priority_score: 1 }),
      ]),
    );

    // Phase B's rank is the contract; the engine's score only breaks ties inside it.
    expect(grouped.needs_your_review.map((i) => i.id)).toEqual(["draft", "capture"]);
  });

  it("puts an overdue payment above a task that is merely due", () => {
    const grouped = groupPhaseBSections(
      sections([
        item({ id: "due", type: "due_soon", priority_score: 90 }),
        item({ id: "late", type: "payment_required", priority_score: 10 }),
      ]),
    );

    expect(grouped.next_actions.map((i) => i.id)).toEqual(["late", "due"]);
  });

  it("breaks a rank tie by score, then by the soonest deadline", () => {
    const grouped = groupPhaseBSections(
      sections([
        item({ id: "later", type: "overdue", priority_score: 50, due_at: "2026-08-01T00:00:00.000Z" }),
        item({ id: "sooner", type: "overdue", priority_score: 50, due_at: "2026-07-01T00:00:00.000Z" }),
        item({ id: "hot", type: "overdue", priority_score: 80, due_at: "2026-09-01T00:00:00.000Z" }),
      ]),
    );

    expect(grouped.next_actions.map((i) => i.id)).toEqual(["hot", "sooner", "later"]);
  });

  it("sinks an item with no deadline below one that has any", () => {
    const grouped = groupPhaseBSections(
      sections([
        item({ id: "undated", type: "overdue", due_at: null }),
        item({ id: "dated", type: "overdue", due_at: "2027-01-01T00:00:00.000Z" }),
      ]),
    );

    expect(grouped.next_actions.map((i) => i.id)).toEqual(["dated", "undated"]);
  });

  it("orders identically regardless of input order — the list must not reshuffle", () => {
    const a = item({ id: "aaa", type: "overdue" });
    const b = item({ id: "bbb", type: "overdue" });

    const forward = groupPhaseBSections(sections([a, b])).next_actions.map((i) => i.id);
    const backward = groupPhaseBSections(sections([b, a])).next_actions.map((i) => i.id);

    expect(forward).toEqual(backward);
  });

  it("surfaces recently resolved items as Recently updated", () => {
    const resolved = item({ id: "done", type: "due_soon", status: "resolved" });

    const grouped = groupPhaseBSections(sections([], [resolved]));

    // Until Phase B this bucket was fetched, hydrated and never rendered.
    expect(grouped.recently_updated.map((i) => i.id)).toEqual(["done"]);
    expect(grouped.needs_your_review).toEqual([]);
    expect(grouped.next_actions).toEqual([]);
  });

  it("drains all four transport buckets, not just the first", () => {
    const grouped = groupPhaseBSections({
      due_soon: [item({ id: "d", type: "due_soon" })],
      waiting_for_action: [item({ id: "w", type: "approval_required" })],
      missing_information: [item({ id: "m", type: "missing_relation" })],
      ai_suggestions: [item({ id: "a", type: "ai_suggestion" })],
      recently_resolved: [],
    });

    expect(grouped.needs_your_review.map((i) => i.id)).toEqual(["a", "w", "m"]);
    expect(grouped.next_actions.map((i) => i.id)).toEqual(["d"]);
  });
});
