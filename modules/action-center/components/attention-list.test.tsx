// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AttentionList } from "./attention-list";
import type { AttentionItem } from "../queries/get-attention-view";
import { en } from "@/shared/i18n/dictionaries/en";
import { ru } from "@/shared/i18n/dictionaries/ru";

function item(overrides: Partial<AttentionItem>): AttentionItem {
  return {
    id: "ai-1",
    title: "Review capture",
    type: "ai_suggestion",
    status: "open",
    priority: "medium",
    source_type: "ai",
    due_at: null,
    primary_entity_type: "planner_suggestion",
    primary_entity_id: "sug-1",
    metadata: { source: "planner" },
    ...overrides,
  };
}

afterEach(cleanup);

describe("AttentionList — read-only", () => {
  it("renders a planner row as a link to the exact Inbox Review", () => {
    render(<AttentionList t={en.actionCenter} locale="en" items={[item({})]} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/dashboard/inbox?tab=review&suggestion=sug-1");
  });

  it("links a task row to Tasks and a transaction row to Money", () => {
    render(
      <AttentionList t={en.actionCenter} locale="en"
        items={[
          item({ id: "t", source_type: "task", primary_entity_type: "task", primary_entity_id: "task-9" }),
          item({ id: "x", source_type: "transaction", primary_entity_type: "transaction", primary_entity_id: "tx-9" }),
        ]}
      />,
    );
    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(hrefs).toContain("/tasks/task-9");
    expect(hrefs).toContain("/finance/tx-9");
  });

  it("renders a deleted/unknown source as text with no link", () => {
    render(
      <AttentionList t={en.actionCenter} locale="en"
        items={[item({ id: "gone", source_type: "task", primary_entity_type: "task", primary_entity_id: "t1", metadata: { task_deleted: true } })]}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Review capture")).toBeDefined();
  });

  it("contains no mutation controls — no checkboxes and no action buttons", () => {
    render(
      <AttentionList t={en.actionCenter} locale="en"
        items={[
          item({}),
          item({ id: "t", source_type: "task", primary_entity_type: "task", primary_entity_id: "task-9" }),
        ]}
      />,
    );
    // Read-only: no checkboxes, no bulk toolbar, no resolve/dismiss/snooze/execute.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    for (const label of ["Resolve", "Dismiss", "Snooze", "Assign", "Make inactive", "Restore", "Confirm", "Reject", "Delete"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("shows an empty-state message when there is nothing in the view", () => {
    render(<AttentionList t={en.actionCenter} locale="en" items={[]} />);
    expect(screen.getByText("Nothing in this view.")).toBeDefined();
  });

  it("renders the whole row in the viewer's language, including system-generated titles", () => {
    render(
      <AttentionList
        t={ru.actionCenter}
        locale="ru"
        items={[
          item({
            id: "t",
            title: "Overdue task: Позвонить бухгалтеру",
            type: "overdue",
            priority: "high",
            source_type: "task",
            primary_entity_type: "task",
            primary_entity_id: "task-9",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Просрочена задача: Позвонить бухгалтеру")).toBeDefined();
    expect(screen.getByText("Задача")).toBeDefined();
    expect(screen.getByText("Просрочено")).toBeDefined();
    expect(screen.getByText("Открыт")).toBeDefined();
    expect(screen.getByText("Высокий")).toBeDefined();
    expect(screen.getByRole("link").getAttribute("aria-label")).toBe(
      "Просрочена задача: Позвонить бухгалтеру — Открыть в Задачах",
    );
  });

  it("shows the empty state in Russian", () => {
    render(<AttentionList t={ru.actionCenter} locale="ru" items={[]} />);
    expect(screen.getByText("В этом представлении ничего нет.")).toBeDefined();
  });
});
