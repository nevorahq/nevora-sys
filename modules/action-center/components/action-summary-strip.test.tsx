// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttentionCounts } from "../queries/get-attention-view";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(""),
}));

const { ActionSummaryStrip } = await import("./action-summary-strip");

const counts: AttentionCounts = {
  needs_attention: 5,
  due_today: 2,
  upcoming: 3,
  overdue: 6,
  snoozed: 1,
  recently_resolved: 4,
};

afterEach(() => {
  cleanup();
  pushMock.mockClear();
});

describe("ActionSummaryStrip — filter cards", () => {
  it("renders all six cards as accessible buttons showing their counts", () => {
    render(<ActionSummaryStrip counts={counts} active="needs_attention" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
    expect(screen.getByText("Overdue")).toBeDefined();
    expect(screen.getByText("6")).toBeDefined(); // overdue count
  });

  it("marks the active card with aria-pressed and leaves the rest unpressed", () => {
    render(<ActionSummaryStrip counts={counts} active="overdue" />);
    const overdue = screen.getByRole("button", { name: /Overdue/ });
    const dueToday = screen.getByRole("button", { name: /Due Today/ });
    expect(overdue.getAttribute("aria-pressed")).toBe("true");
    expect(dueToday.getAttribute("aria-pressed")).toBe("false");
  });

  it("navigates to ?filter=<key> when a non-default card is clicked", () => {
    render(<ActionSummaryStrip counts={counts} active="needs_attention" />);
    fireEvent.click(screen.getByRole("button", { name: /Overdue/ }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard?filter=overdue", { scroll: false });
  });

  it("clears the filter param when the default card is clicked", () => {
    render(<ActionSummaryStrip counts={counts} active="overdue" />);
    fireEvent.click(screen.getByRole("button", { name: /Needs Attention/ }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard", { scroll: false });
  });
});
