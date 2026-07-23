// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinancialStateBadge } from "./financial-state-badge";

afterEach(cleanup);

/**
 * Sprint 4.4 rollout: the canonical-state badge renders one vocabulary across
 * every money surface, and each converted surface stops printing a raw status.
 */

const LABELS = {
  detected: "Detected",
  needs_review: "Needs review",
  planned: "Planned",
  due: "Due",
  paid: "Paid",
  cancelled: "Cancelled",
};

describe("FinancialStateBadge", () => {
  it.each([
    ["subscription_cycle", "task_open", "Due"],
    ["subscription_cycle", "planned", "Planned"],
    ["subscription_cycle", "paid", "Paid"],
    ["subscription_cycle", "skipped", "Cancelled"],
    ["subscription_cycle", "failed", "Due"],
    ["transaction", "posted", "Paid"],
    ["financial_task", "open", "Due"],
    ["suggestion", "detected", "Detected"],
  ] as const)("%s/%s renders the canonical label %s", (surface, status, expected) => {
    render(<FinancialStateBadge surface={surface} status={status} labels={LABELS} />);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("a planned obligation whose date has arrived reads as due (contract §1)", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    render(
      <FinancialStateBadge surface="subscription_cycle" status="planned" dueDate={yesterday} labels={LABELS} />,
    );
    expect(screen.getByText("Due")).toBeTruthy();
  });

  it("a planned obligation still in the future reads as planned", () => {
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    render(
      <FinancialStateBadge surface="financial_task" status="open" dueDate={nextYear} labels={LABELS} />,
    );
    expect(screen.getByText("Planned")).toBeTruthy();
  });

  it("a paid obligation is never re-derived from its date", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    render(
      <FinancialStateBadge surface="subscription_cycle" status="paid" dueDate={yesterday} labels={LABELS} />,
    );
    expect(screen.getByText("Paid")).toBeTruthy();
  });

  it("falls back to the humanised raw status when unmapped (never blank)", () => {
    render(<FinancialStateBadge surface="subscription_cycle" status="weird_state" labels={LABELS} />);
    expect(screen.getByText("weird state")).toBeTruthy();
  });
});

describe("Sprint 4.4 rollout: converted surfaces use the badge", () => {
  const ROOT = process.cwd();
  const panel = readFileSync(
    join(ROOT, "modules/subtracker/components/subscription-payment-workflow-panel.tsx"),
    "utf8",
  );

  const financialTaskPanel = readFileSync(
    join(ROOT, "modules/tasks/components/financial-task-panel.tsx"),
    "utf8",
  );

  /** Every money surface converted in unit 4.4. */
  const CONVERTED = [
    "modules/subtracker/components/subscription-payment-workflow-panel.tsx",
    "modules/subtracker/components/subscription-payment-task-panel.tsx",
    "modules/subtracker/components/subscription-suggestion-panel.tsx",
    "modules/subtracker/components/sub-item.tsx",
    "modules/tasks/components/financial-task-panel.tsx",
    "modules/documents/components/document-extraction-review.tsx",
  ] as const;

  it("the subscription payment panel renders the badge, not a raw status", () => {
    expect(panel).toContain("FinancialStateBadge");
    expect(panel).not.toMatch(/\.status\.replace\(/);
    expect(panel).not.toContain("STATUS_STYLE");
  });

  it("the financial task panel renders the badge, not its own status map", () => {
    expect(financialTaskPanel).toContain("FinancialStateBadge");
    expect(financialTaskPanel).not.toContain("STATUS_CLASS");
    expect(financialTaskPanel).not.toContain("statusLabel");
  });

  it.each(CONVERTED)("%s renders the canonical badge", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    expect(src).toContain("FinancialStateBadge");
    // The vocabulary lives in `dict.money.states` only — a surface that
    // reintroduces its own labels would drift from the 4.1 contract.
    expect(src).toMatch(/labels=\{(stateLabels|dict\.money\.states)\}/);
  });

  it("no surface keeps a competing hardcoded review-state vocabulary", () => {
    const reviewConstants = readFileSync(join(ROOT, "modules/review/constants/review.constants.ts"), "utf8");
    expect(reviewConstants).not.toContain("REVIEW_STATE_LABELS");
    for (const file of CONVERTED) {
      expect(readFileSync(join(ROOT, file), "utf8")).not.toContain("REVIEW_STATE_LABELS");
    }
  });
});
