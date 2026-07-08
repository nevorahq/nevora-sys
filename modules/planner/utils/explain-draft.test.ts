import { describe, expect, it } from "vitest";
import { explainDraft } from "./explain-draft";
import type { DraftOriginEntry, PlannerSuggestion, PlannerSuggestionType } from "../types/planner.types";

const DOC_ID = "11111111-1111-4111-8111-111111111111";

function suggestion(overrides: Partial<PlannerSuggestion> = {}): PlannerSuggestion {
  return {
    id: "sug-1",
    organization_id: "org-1",
    workspace_id: "ws-1",
    planner_entry_id: "entry-1",
    suggestion_type: "create_task",
    title: "Review the lease",
    description: null,
    proposed_payload: {},
    confidence: 0.9,
    status: "pending",
    accepted_entity_type: null,
    accepted_entity_id: null,
    reject_reason: null,
    claimed_at: null,
    created_by: "user-1",
    owner_user_id: "user-1",
    visibility: "private",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function entry(overrides: Partial<DraftOriginEntry> = {}): DraftOriginEntry {
  return { source: "manual", raw_text: "pay the rent", ai_detected_intent: null, ...overrides };
}

describe("explainDraft — what will change", () => {
  it("a plain task draft creates one task and no link", () => {
    const result = explainDraft(suggestion(), entry());

    expect(result.effects).toEqual([{ kind: "create", entityType: "task" }]);
    expect(result.moneySafe).toBe(false);
    expect(result.unsupported).toBe(false);
  });

  it("a task draft carrying linkTo announces the relation it will draw", () => {
    const result = explainDraft(
      suggestion({
        proposed_payload: { linkTo: { entityType: "document", entityId: DOC_ID, linkType: "requires_action_task" } },
      }),
      entry(),
    );

    // This is the canonical B3 example: "Будет создана связь: document → task".
    expect(result.effects).toEqual([
      { kind: "create", entityType: "task" },
      { kind: "link", fromType: "document", toType: "task" },
    ]);
  });

  it("ignores a malformed linkTo rather than promising a link it cannot draw", () => {
    const cases = [{ linkTo: null }, { linkTo: "document" }, { linkTo: {} }, { linkTo: { entityType: "" } }];

    for (const proposed_payload of cases) {
      const result = explainDraft(suggestion({ proposed_payload }), entry());
      expect(result.effects).toEqual([{ kind: "create", entityType: "task" }]);
    }
  });

  it("a link_entities draft creates no new records", () => {
    const result = explainDraft(
      suggestion({
        suggestion_type: "link_entities",
        proposed_payload: { sourceType: "document", sourceId: DOC_ID, targetType: "task", targetId: DOC_ID },
      }),
      entry(),
    );

    expect(result.effects).toEqual([
      { kind: "link", fromType: "document", toType: "task" },
      { kind: "no_new_data" },
    ]);
  });

  it("a link_entities draft with no usable endpoints claims nothing", () => {
    const result = explainDraft(suggestion({ suggestion_type: "link_entities", proposed_payload: {} }), entry());
    expect(result.effects).toEqual([{ kind: "no_new_data" }]);
  });

  it("an action item draft says where it will surface", () => {
    const result = explainDraft(suggestion({ suggestion_type: "create_action_item" }), entry());
    expect(result.effects).toEqual([{ kind: "create", entityType: "action_item" }]);
  });
});

describe("explainDraft — money safety", () => {
  const financialTypes: PlannerSuggestionType[] = [
    "create_financial_task",
    "create_money_reminder",
    "create_subscription_reminder",
  ];

  it.each(financialTypes)("%s is flagged money-safe and creates only a planned task", (suggestion_type) => {
    const result = explainDraft(suggestion({ suggestion_type }), entry());

    expect(result.moneySafe).toBe(true);
    // Never a transaction: the accept path routes these to createFinancialTask.
    expect(result.effects).toEqual([{ kind: "create", entityType: "financial_task" }]);
  });

  it("does not flag a non-financial draft as money-related", () => {
    expect(explainDraft(suggestion(), entry()).moneySafe).toBe(false);
  });
});

describe("explainDraft — unsupported types", () => {
  const unsupported: PlannerSuggestionType[] = ["create_document", "assign_project", "create_project"];

  it.each(unsupported)("%s is marked unsupported and promises no effect", (suggestion_type) => {
    const result = explainDraft(suggestion({ suggestion_type }), entry());

    // routeAccept() refuses these. Announcing an effect would be a lie.
    expect(result.unsupported).toBe(true);
    expect(result.effects).toEqual([]);
  });

  it.each(["create_task", "link_entities", "create_action_item"] as PlannerSuggestionType[])(
    "%s is supported",
    (suggestion_type) => {
      expect(explainDraft(suggestion({ suggestion_type }), entry()).unsupported).toBe(false);
    },
  );
});

describe("explainDraft — why this was proposed", () => {
  it("names the source entity when a business object seeded the capture", () => {
    const result = explainDraft(
      suggestion(),
      entry({ source: "document", raw_text: "lease-agreement.pdf" }),
    );

    expect(result.origin).toEqual({ kind: "source_entity", sourceType: "document", label: "lease-agreement.pdf" });
  });

  it("reports the AI intent for a typed capture", () => {
    const result = explainDraft(suggestion(), entry({ source: "manual", ai_detected_intent: "pay a bill" }));

    expect(result.origin).toEqual({ kind: "ai_detection", intent: "pay a bill" });
  });

  it("falls back to a bare capture when there is no intent and no source", () => {
    expect(explainDraft(suggestion(), entry({ source: "manual", ai_detected_intent: null })).origin).toEqual({
      kind: "manual_capture",
    });
  });

  it("does not attribute an origin it cannot verify", () => {
    // The capture fell outside the loaded page; guessing would be worse than silence.
    expect(explainDraft(suggestion(), null).origin).toEqual({ kind: "manual_capture" });
  });

  it("bands the confidence so the UI can flag a weak proposal", () => {
    expect(explainDraft(suggestion({ confidence: 0.9 }), entry()).band).toBe("ready");
    expect(explainDraft(suggestion({ confidence: 0.7 }), entry()).band).toBe("needs_review");
    expect(explainDraft(suggestion({ confidence: 0.2 }), entry()).band).toBe("insufficient");
  });
});
