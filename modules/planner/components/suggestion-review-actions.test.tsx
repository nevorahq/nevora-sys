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
  it("warns that a dateless financial suggestion needs a payment date", () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_financial_task", { amount: 300 })} dict={dict} />);
    expect(screen.getByText(dict.financialFields.needsDateHint)).toBeDefined();
  });

  it("exposes a payment-date field in the edit form for a financial suggestion", () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_financial_task", { amount: 300 })} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.edit }));
    expect(screen.getByLabelText(dict.financialFields.paymentDate)).toBeDefined();
    expect(screen.getByLabelText(dict.financialFields.amount)).toBeDefined();
  });

  it("routes Accept to the editor (pre-filled with today) when the date is missing", () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_financial_task", { amount: 300 })} dict={dict} />);
    fireEvent.click(screen.getByRole("button", { name: dict.accept }));

    // The accept action must not fire — there is no date to accept yet.
    expect(acceptMock).not.toHaveBeenCalled();
    const dateInput = screen.getByLabelText(dict.financialFields.paymentDate) as HTMLInputElement;
    const today = new Date();
    const expected = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    expect(dateInput.value).toBe(expected);
  });

  it("does not show financial fields for a non-financial suggestion", () => {
    render(<SuggestionReviewActions suggestion={suggestion("create_task")} dict={dict} />);
    expect(screen.queryByText(dict.financialFields.needsDateHint)).toBeNull();
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
