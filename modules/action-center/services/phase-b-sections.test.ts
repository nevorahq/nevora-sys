import { describe, expect, it } from "vitest";
import { ACTION_ITEM_TYPES, type ActionItemType } from "../types/action-item.types";
import type { ActionFeedItem, ActionFeedSections } from "../types/action-center.types";
import {
  groupPhaseBSections,
  isMoneyAttentionItem,
  phaseBRank,
  phaseBSectionOf,
  phaseBSectionOfItem,
} from "./phase-b-sections";

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
      expect(["needs_your_review", "money_attention", "next_actions"]).toContain(phaseBSectionOf(type));
      expect(phaseBRank(type)).toBeGreaterThanOrEqual(1);
      expect(phaseBRank(type)).toBeLessThanOrEqual(5);
    }
  });

  it("routes decisions to review, money-by-type to money attention, and work to next actions", () => {
    const review: ActionItemType[] = [
      "approval_required",
      "draft_review",
      "ai_suggestion",
      "risk_detected",
      "missing_information",
      "missing_relation",
      "assignment_required",
    ];
    // payment_required / renewal_required are financial by definition, so their
    // base anchor is money_attention regardless of source.
    const money: ActionItemType[] = ["payment_required", "renewal_required"];
    const work: ActionItemType[] = ["overdue", "due_soon", "document_review", "follow_up_required"];

    for (const type of review) expect(phaseBSectionOf(type)).toBe("needs_your_review");
    for (const type of money) expect(phaseBSectionOf(type)).toBe("money_attention");
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

// §9 — Money Attention. A financial item is pulled OUT of review/next-actions into
// its own section, decided per-item from fields it already carries (no new model).
describe("money attention (§9)", () => {
  it("treats payment/renewal types as money whatever their source", () => {
    expect(isMoneyAttentionItem({ type: "payment_required", source_type: "system", primary_entity_type: null })).toBe(true);
    expect(isMoneyAttentionItem({ type: "renewal_required", source_type: "system", primary_entity_type: null })).toBe(true);
  });

  it("treats a transaction/subscription source or primary entity as money", () => {
    // A document-derived draft expense: draft_review sourced from a transaction.
    expect(isMoneyAttentionItem({ type: "draft_review", source_type: "transaction", primary_entity_type: "transaction" })).toBe(true);
    // An uncategorized transaction: missing_information on a transaction.
    expect(isMoneyAttentionItem({ type: "missing_information", source_type: "transaction", primary_entity_type: null })).toBe(true);
    // A subscription payment cycle awaiting confirmation.
    expect(isMoneyAttentionItem({ type: "approval_required", source_type: "subscription", primary_entity_type: "subscription" })).toBe(true);
    // Primary entity alone is enough, even if the source is generic.
    expect(isMoneyAttentionItem({ type: "risk_detected", source_type: "ai", primary_entity_type: "transaction" })).toBe(true);
  });

  it("leaves non-money items where they were", () => {
    // A draft on a document is still a review decision, not a money matter.
    expect(isMoneyAttentionItem({ type: "draft_review", source_type: "document", primary_entity_type: "document" })).toBe(false);
    expect(phaseBSectionOfItem({ type: "draft_review", source_type: "document", primary_entity_type: "document" })).toBe("needs_your_review");
    // An ordinary task due soon is work, not money.
    expect(phaseBSectionOfItem({ type: "due_soon", source_type: "task", primary_entity_type: "task" })).toBe("next_actions");
  });

  it("a financial draft leaves review and a financial follow-up leaves next-actions", () => {
    const financialDraft = item({ id: "fin-draft", type: "draft_review", source_type: "transaction", primary_entity_type: "transaction" });
    const plainDraft = item({ id: "plain-draft", type: "draft_review", source_type: "document" });
    const subRenewal = item({ id: "renewal", type: "renewal_required", source_type: "subscription" });
    const plainTask = item({ id: "task", type: "due_soon", source_type: "task" });

    const grouped = groupPhaseBSections(sections([financialDraft, plainDraft, subRenewal, plainTask]));

    expect(grouped.money_attention.map((i) => i.id)).toEqual(["fin-draft", "renewal"]);
    expect(grouped.needs_your_review.map((i) => i.id)).toEqual(["plain-draft"]);
    expect(grouped.next_actions.map((i) => i.id)).toEqual(["task"]);
  });

  it("orders money attention by urgency: a draft to confirm above an overdue payment above a renewal", () => {
    const renewal = item({ id: "renewal", type: "renewal_required", source_type: "subscription" });
    const overduePay = item({ id: "overdue-pay", type: "payment_required", source_type: "subscription" });
    const draft = item({ id: "draft", type: "draft_review", source_type: "transaction" });

    const grouped = groupPhaseBSections(sections([renewal, overduePay, draft]));

    // rank 1 (draft) → rank 2 (payment/renewal share the rank, tie broken by score/date/id).
    expect(grouped.money_attention[0].id).toBe("draft");
    expect(grouped.money_attention.map((i) => i.id)).toContain("overdue-pay");
    expect(grouped.money_attention).toHaveLength(3);
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

  it("puts an overdue item above a task that is merely due", () => {
    // Both are non-money work, so they share the Next actions section; rank (late
    // before due) beats the higher score on the merely-due one. (An overdue
    // *payment* would instead move to Money attention — covered in the §9 block.)
    const grouped = groupPhaseBSections(
      sections([
        item({ id: "due", type: "due_soon", priority_score: 90 }),
        item({ id: "late", type: "overdue", priority_score: 10 }),
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
