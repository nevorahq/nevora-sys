// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/shared/i18n/dictionaries/en";
import type { PlannerSuggestion, PlannerSuggestionType } from "../types/planner.types";

const acceptMock = vi.fn(async (..._args: unknown[]) => ({}) as Record<string, unknown>);
const rejectMock = vi.fn(async (..._args: unknown[]) => ({}) as Record<string, unknown>);
const editMock = vi.fn(async (..._args: unknown[]) => ({}) as Record<string, unknown>);

vi.mock("../actions/accept-planner-suggestion.action", () => ({
  acceptPlannerSuggestionAction: (...args: unknown[]) => acceptMock(...args),
}));
vi.mock("../actions/reject-planner-suggestion.action", () => ({
  rejectPlannerSuggestionAction: (...args: unknown[]) => rejectMock(...args),
}));
vi.mock("../actions/edit-planner-suggestion.action", () => ({
  editPlannerSuggestionAction: (...args: unknown[]) => editMock(...args),
}));

// Imported after the mocks so the component binds to them.
const { SuggestionReviewActions } = await import("./suggestion-review-actions");

const dict = en.inbox;

afterEach(() => {
  cleanup();
  acceptMock.mockClear();
  rejectMock.mockClear();
  editMock.mockClear();
});

function suggestion(
  type: PlannerSuggestionType,
  payload: Record<string, unknown> = {},
): PlannerSuggestion {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organization_id: "org",
    workspace_id: "ws",
    planner_entry_id: "entry",
    suggestion_type: type,
    title: "оплатить ремонт",
    description: null,
    proposed_payload: payload,
    confidence: 0.7,
    status: "pending",
    accepted_entity_type: null,
    accepted_entity_id: null,
    reject_reason: null,
    claimed_at: null,
    created_by: "user",
    owner_user_id: "user",
    visibility: "private",
    created_at: "2026-07-14T00:00:00Z",
    updated_at: "2026-07-14T00:00:00Z",
  };
}

describe("SuggestionReviewActions — financial capture", () => {
  it("exposes a payment-date field in the edit form for a financial suggestion", () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_financial_task", { amount: 300 })} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));
    expect(screen.getByLabelText(dict.financialFields.paymentDate)).toBeDefined();
    expect(screen.getByLabelText(dict.financialFields.amount)).toBeDefined();
  });

  it("accepts a dateless financial draft directly — it becomes a task without a due date", async () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_financial_task", { amount: 300 })} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.accept }));

    await waitFor(() => expect(acceptMock).toHaveBeenCalledTimes(1));
  });

  it("does not show financial fields for a non-financial suggestion", () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_task")} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));
    expect(screen.queryByLabelText(dict.financialFields.paymentDate)).toBeNull();
  });

  it("marshals the entered date into the proposed_payload sent to the edit action", async () => {
    render(
      <SuggestionReviewActions
        suggestion={suggestion("create_financial_task", { amount: 300, currency: "MDL" })}
        dict={dict}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));
    fireEvent.change(screen.getByLabelText(dict.financialFields.paymentDate), { target: { value: "2026-07-20" } });
    fireEvent.click(screen.getByRole("button", { name: dict.save }));

    await waitFor(() => expect(editMock).toHaveBeenCalledTimes(1));
    const formData = editMock.mock.calls[0][1] as FormData;
    const payload = JSON.parse(formData.get("proposedPayload") as string);
    expect(payload).toMatchObject({ financialDueDate: "2026-07-20", amount: 300, currency: "MDL" });
  });
});

describe("SuggestionReviewActions — project picker (ADR 002, 0.2b)", () => {
  const projects = [
    { id: "22222222-2222-4222-8222-222222222222", name: "Website redesign" },
    { id: "33333333-3333-4333-8333-333333333333", name: "Acme retainer" },
  ];
  const payloadSent = () => JSON.parse((editMock.mock.calls[0][1] as FormData).get("proposedPayload") as string);

  it("pre-selects the suggested project and keeps the other payload keys when it changes", async () => {
    const draft = suggestion("create_task", { dueDate: "2026-10-01", priority: "high", projectId: projects[0].id });
    render(<SuggestionReviewActions suggestion={draft} projects={projects} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));

    const select = screen.getByLabelText(dict.project.label) as HTMLSelectElement;
    expect(select.value).toBe(projects[0].id);
    fireEvent.change(select, { target: { value: projects[1].id } });
    fireEvent.click(screen.getByRole("button", { name: dict.save }));

    await waitFor(() => expect(editMock).toHaveBeenCalledTimes(1));
    expect(payloadSent()).toEqual({ dueDate: "2026-10-01", priority: "high", projectId: projects[1].id });
  });

  it("removes the project when \"No project\" is chosen", async () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_task", { projectId: projects[0].id })} projects={projects} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));
    fireEvent.change(screen.getByLabelText(dict.project.label), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: dict.save }));

    await waitFor(() => expect(editMock).toHaveBeenCalledTimes(1));
    expect(payloadSent()).toEqual({});
  });

  it("puts the chosen project into a financial draft's payload", async () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_financial_task", { amount: 300 })} projects={projects} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));
    fireEvent.change(screen.getByLabelText(dict.project.label), { target: { value: projects[1].id } });
    fireEvent.click(screen.getByRole("button", { name: dict.save }));

    await waitFor(() => expect(editMock).toHaveBeenCalledTimes(1));
    expect(payloadSent()).toMatchObject({ amount: 300, projectId: projects[1].id });
  });

  it("shows no picker without the project list, and then leaves the payload alone", async () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_task", { projectId: projects[0].id })} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));
    expect(screen.queryByLabelText(dict.project.label)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: dict.save }));

    await waitFor(() => expect(editMock).toHaveBeenCalledTimes(1));
    expect((editMock.mock.calls[0][1] as FormData).get("proposedPayload")).toBeNull();
  });
});
