// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import type { PlannerSuggestion } from "../types/planner.types";

vi.mock("../actions/accept-planner-suggestion.action", () => ({ acceptPlannerSuggestionAction: vi.fn() }));
vi.mock("../actions/reject-planner-suggestion.action", () => ({ rejectPlannerSuggestionAction: vi.fn() }));
vi.mock("../actions/edit-planner-suggestion.action", () => ({ editPlannerSuggestionAction: vi.fn() }));

const { PlannerSuggestionCard } = await import("./planner-suggestion-card");

const dict = en.inbox;
const projects = [{ id: "22222222-2222-4222-8222-222222222222", name: "Website redesign" }];

function draft(overrides: Partial<PlannerSuggestion> = {}): PlannerSuggestion {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "org",
    workspace_id: "ws",
    planner_entry_id: "entry",
    suggestion_type: "create_task",
    title: "Send the mockups",
    description: null,
    proposed_payload: { projectId: projects[0].id },
    confidence: 0.9,
    status: "pending",
    accepted_entity_type: null,
    accepted_entity_id: null,
    reject_reason: null,
    claimed_at: null,
    created_by: "user",
    owner_user_id: "user",
    visibility: "private",
    created_at: "2026-09-29T00:00:00Z",
    updated_at: "2026-09-29T00:00:00Z",
    ...overrides,
  };
}

afterEach(cleanup);

describe("PlannerSuggestionCard — project", () => {
  it("names the project AI suggested", () => {
    render(<PlannerSuggestionCard suggestion={draft()} projects={projects} dict={dict} />);
    expect(screen.getByText("Website redesign")).toBeDefined();
    expect(screen.getByText(`· ${dict.project.suggested}`, { exact: false })).toBeDefined();
  });

  it("drops the \"suggested\" mark once the user edited the draft", () => {
    render(<PlannerSuggestionCard suggestion={draft({ status: "edited" })} projects={projects} dict={dict} />);
    expect(screen.getByText("Website redesign")).toBeDefined();
    expect(screen.queryByText(dict.project.suggested, { exact: false })).toBeNull();
  });

  it("shows no project for an unknown (archived) one or without the list", () => {
    const { unmount } = render(
      <PlannerSuggestionCard suggestion={draft({ proposed_payload: { projectId: "99999999-9999-4999-8999-999999999999" } })} projects={projects} dict={dict} />,
    );
    expect(screen.queryByText(`${dict.project.label}:`)).toBeNull();
    unmount();
    render(<PlannerSuggestionCard suggestion={draft()} dict={dict} />);
    expect(screen.queryByText("Website redesign")).toBeNull();
  });

  it("says the project came from the user's rule", () => {
    render(
      <PlannerSuggestionCard
        suggestion={draft({ proposed_payload: { projectId: projects[0].id, projectSource: "rule", projectRuleId: "r1" } })}
        projects={projects}
        dict={dict}
      />,
    );
    expect(screen.getByText(dict.project.byRule, { exact: false })).toBeDefined();
    expect(screen.queryByText(dict.project.suggested, { exact: false })).toBeNull();
  });
});
