import { describe, it, expect } from "vitest";
import {
  mapSuggestionToReviewActionItem,
  mapEntryToMissingInfoActionItem,
} from "./map-suggestion-to-action-item";
import type { PlannerSuggestion, PlannerEntry } from "../types/planner.types";

function makeSuggestion(overrides: Partial<PlannerSuggestion> = {}): PlannerSuggestion {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organization_id: "org",
    workspace_id: "ws",
    planner_entry_id: "22222222-2222-2222-2222-222222222222",
    suggestion_type: "create_task",
    title: "Do the thing",
    description: null,
    proposed_payload: {},
    confidence: 0.9,
    status: "pending",
    accepted_entity_type: null,
    accepted_entity_id: null,
    reject_reason: null,
    claimed_at: null,
    created_by: "user",
    owner_user_id: "user",
    visibility: "private",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("map-suggestion-to-action-item", () => {
  it("maps a high-confidence suggestion to an ai_suggestion review item keyed by suggestion id", () => {
    const item = mapSuggestionToReviewActionItem(makeSuggestion({ confidence: 0.92 }));
    expect(item.type).toBe("ai_suggestion");
    expect(item.sourceType).toBe("ai");
    expect(item.sourceId).toBe("11111111-1111-1111-1111-111111111111");
    expect(item.metadata?.source).toBe("planner");
  });

  it("maps a low-confidence suggestion to a missing_information item", () => {
    const item = mapSuggestionToReviewActionItem(makeSuggestion({ confidence: 0.5 }));
    expect(item.type).toBe("missing_information");
  });

  it("maps a failed entry to a missing_information review item", () => {
    const entry = { id: "33333333-3333-3333-3333-333333333333", ai_confidence: null } as PlannerEntry;
    const item = mapEntryToMissingInfoActionItem(entry, "boom");
    expect(item.type).toBe("missing_information");
    expect(item.sourceId).toBe("33333333-3333-3333-3333-333333333333");
    expect(item.aiReason).toBe("boom");
  });
});
