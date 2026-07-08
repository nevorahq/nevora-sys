import { describe, expect, it } from "vitest";
import {
  detectedSuggestionSchema,
  createTaskPayloadSchema,
  linkEntitiesPayloadSchema,
} from "@/modules/planner/schemas/planner-suggestion.schema";
import { planFirstActionDraft } from "./plan-first-action-draft";

// The accept-time payload schemas validate these as UUIDs, so the fixtures must
// be RFC-4122 valid (version nibble 1-5, variant nibble 8/9/a/b) — a draft
// carrying a malformed id would fail on confirm, not here.
const DOC_ID = "11111111-1111-4111-8111-111111111111";
const SUB_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_DOC_ID = "44444444-4444-4444-8444-444444444444";

describe("planFirstActionDraft", () => {
  it("proposes a review task linked back to the document", () => {
    const draft = planFirstActionDraft({ kind: "document", id: DOC_ID, title: "lease-agreement.pdf" });

    expect(draft.suggestionType).toBe("create_task");
    expect(draft.title).toContain("lease-agreement.pdf");

    // The draft must survive the very schema the accept path re-validates it with,
    // otherwise the user sees "Invalid task payload" on confirm.
    const parsed = createTaskPayloadSchema.safeParse({ title: draft.title, ...draft.proposedPayload });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.linkTo).toEqual({
      entityType: "document",
      entityId: DOC_ID,
      linkType: "requires_action_task",
    });
  });

  it("proposes a renewal review for a subscription, not another payment reminder", () => {
    const draft = planFirstActionDraft({ kind: "subscription", id: SUB_ID, name: "Figma" });

    // createSubscriptionAction already provisioned the payment task; a financial
    // draft here would duplicate it.
    expect(draft.suggestionType).toBe("create_task");

    const parsed = createTaskPayloadSchema.safeParse({ title: draft.title, ...draft.proposedPayload });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.linkTo).toEqual({
      entityType: "subscription",
      entityId: SUB_ID,
      linkType: "renewal_task",
    });
  });

  it("links a bare task to the newest document when one exists", () => {
    const draft = planFirstActionDraft({
      kind: "task",
      id: TASK_ID,
      title: "Check the terms",
      linkCandidate: { entityType: "document", entityId: OTHER_DOC_ID, label: "contract.pdf" },
    });

    expect(draft.suggestionType).toBe("link_entities");

    const parsed = linkEntitiesPayloadSchema.safeParse(draft.proposedPayload);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toMatchObject({
      sourceType: "document",
      sourceId: OTHER_DOC_ID,
      targetType: "task",
      targetId: TASK_ID,
      linkType: "requires_action_task",
    });
  });

  it("falls back to an action item when a task has nothing to link to", () => {
    const draft = planFirstActionDraft({ kind: "task", id: TASK_ID, title: "Call the bank", linkCandidate: null });

    expect(draft.suggestionType).toBe("create_action_item");
    expect(draft.proposedPayload).toEqual({});
  });

  it("never proposes a draft that could post money", () => {
    const drafts = [
      planFirstActionDraft({ kind: "document", id: DOC_ID, title: "invoice.pdf" }),
      // "Pay AWS" is exactly the phrasing that would tempt a financial draft.
      planFirstActionDraft({ kind: "subscription", id: SUB_ID, name: "AWS" }),
      planFirstActionDraft({ kind: "task", id: TASK_ID, title: "Pay AWS invoice", linkCandidate: null }),
    ];

    const moneyTypes = ["create_financial_task", "create_money_reminder", "create_subscription_reminder"];
    for (const draft of drafts) {
      expect(moneyTypes).not.toContain(draft.suggestionType);
      expect(["create_task", "link_entities", "create_action_item"]).toContain(draft.suggestionType);
    }
  });

  it("truncates over-long titles so the planner still accepts the draft", () => {
    const drafts = [
      planFirstActionDraft({ kind: "document", id: DOC_ID, title: "x".repeat(400) }),
      planFirstActionDraft({ kind: "subscription", id: SUB_ID, name: "y".repeat(400) }),
      planFirstActionDraft({
        kind: "task",
        id: TASK_ID,
        title: "z".repeat(400),
        linkCandidate: { entityType: "document", entityId: OTHER_DOC_ID, label: "w".repeat(400) },
      }),
      planFirstActionDraft({ kind: "task", id: TASK_ID, title: "q".repeat(400), linkCandidate: null }),
    ];

    for (const draft of drafts) {
      expect(draft.title.length).toBeLessThanOrEqual(200);
      expect(detectedSuggestionSchema.safeParse(draft).success).toBe(true);
    }
  });
});
