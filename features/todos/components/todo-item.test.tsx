// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../actions/delete-todo.action", () => ({ deleteTodoAction: vi.fn() }));
vi.mock("./task-status-badge", () => ({ TaskStatusBadge: () => <span>Status</span> }));

const { TodoItem } = await import("./todo-item");

afterEach(() => cleanup());

const baseTodo = {
  id: "44444444-4444-4444-8444-444444444444",
  user_id: "33333333-3333-4333-8333-333333333333",
  title: "Task title",
  description: "Description",
  is_completed: false,
  status: "todo",
  priority: "medium",
  due_date: null,
  recurrence: "none",
  recurrence_source_id: null,
  project_id: null,
  created_at: "2026-06-27T10:00:00Z",
  updated_at: "2026-06-27T10:00:00Z",
} as const;

const baseDict = {
  todos: {
    form: { updateButton: "Edit task" },
    priorities: { low: "Low", medium: "Medium", high: "High" },
    item: { delete: "Delete" },
    due: {
      overdue: "Overdue",
      today: "Due today",
      tomorrow: "Tomorrow",
      inDays: "In {days} days",
      ariaOverdue: "Overdue task needs attention",
      ariaSoon: "Due soon task needs attention",
    },
  },
} as never;

describe("TodoItem", () => {
  it("links to task details without showing the old edit button", () => {
    render(<TodoItem
      todo={baseTodo}
      dict={baseDict}
    />);

    expect(screen.getByRole("link", { name: /Task title/ }).getAttribute("href")).toBe("/tasks/44444444-4444-4444-8444-444444444444");
    expect(screen.queryByRole("button", { name: "Edit task" })).toBeNull();
  });

  it("shows the overdue marker as an icon on mobile and with its label from md up", () => {
    render(<TodoItem
      todo={{ ...baseTodo, due_date: "2000-01-01" }}
      dict={baseDict}
    />);

    const marker = screen.getByLabelText("Overdue task needs attention");
    expect(marker.getAttribute("title")).toBe("Overdue");
    const label = screen.getByText("Overdue");
    expect(label.className).toContain("sr-only");
    expect(label.className).toContain("md:not-sr-only");
  });

  it("shows the priority as a dot, with its label for screen readers and desktop", () => {
    render(<TodoItem todo={{ ...baseTodo, priority: "high" }} dict={baseDict} />);

    const label = screen.getByText("High");
    expect(label.className).toContain("md:not-sr-only");
    expect(label.closest("[title]")?.getAttribute("title")).toBe("High");
  });
});
