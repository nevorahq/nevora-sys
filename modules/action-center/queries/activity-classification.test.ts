import { describe, it, expect } from "vitest";
import {
  activityTypeForEvent,
  visibilityForEvent,
  ACTIVITY_TYPES,
} from "./activity-classification";
import { DOMAIN_EVENT_NAMES } from "@/lib/events/domain-event-names";

describe("activityTypeForEvent", () => {
  it("classifies every registered domain event into a valid class", () => {
    for (const name of DOMAIN_EVENT_NAMES) {
      expect(ACTIVITY_TYPES).toContain(activityTypeForEvent(name));
    }
  });

  it("treats capture inbox and AI suggestions as personal", () => {
    expect(activityTypeForEvent("planner_entry.created")).toBe("personal");
    expect(activityTypeForEvent("planner_suggestion.created")).toBe("personal");
    expect(activityTypeForEvent("planner_suggestion.accepted")).toBe("personal");
    expect(activityTypeForEvent("money.ai_suggestion.created")).toBe("personal");
    expect(activityTypeForEvent("recommendation.dismissed")).toBe("personal");
  });

  it("treats membership, billing and org structure changes as security", () => {
    expect(activityTypeForEvent("member.invited")).toBe("security");
    expect(activityTypeForEvent("member.role_changed")).toBe("security");
    expect(activityTypeForEvent("member.removed")).toBe("security");
    expect(activityTypeForEvent("billing.plan.changed")).toBe("security");
    expect(activityTypeForEvent("billing.trial.claimed")).toBe("security");
    expect(activityTypeForEvent("org.updated")).toBe("security");
    expect(activityTypeForEvent("workspace.created")).toBe("security");
  });

  it("treats background jobs as system", () => {
    expect(activityTypeForEvent("document.extraction.started")).toBe("system");
    expect(activityTypeForEvent("document.extraction.completed")).toBe("system");
    expect(activityTypeForEvent("document.financial_data_extracted")).toBe("system");
    expect(activityTypeForEvent("money.transaction.categorization_requested")).toBe("system");
    expect(activityTypeForEvent("action_center.item_created")).toBe("system");
  });

  it("treats ordinary business records as business (org-wide)", () => {
    expect(activityTypeForEvent("task.created")).toBe("business");
    expect(activityTypeForEvent("document.created")).toBe("business");
    expect(activityTypeForEvent("money.transaction.confirmed")).toBe("business");
    expect(activityTypeForEvent("subscription.created")).toBe("business");
    expect(activityTypeForEvent("money.transaction.created")).toBe("business");
  });

  it("does not confuse money.ai_suggestion (personal) with money.transaction (business)", () => {
    expect(activityTypeForEvent("money.ai_suggestion.accepted")).toBe("personal");
    expect(activityTypeForEvent("money.transaction.created")).toBe("business");
  });
});

describe("visibilityForEvent", () => {
  it("maps class to scope", () => {
    expect(visibilityForEvent("task.created")).toBe("organization");
    expect(visibilityForEvent("member.invited")).toBe("organization");
    expect(visibilityForEvent("planner_entry.created")).toBe("private");
    expect(visibilityForEvent("document.extraction.started")).toBe("system");
  });
});
