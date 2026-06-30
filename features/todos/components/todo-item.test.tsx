// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../actions/delete-todo.action", () => ({ deleteTodoAction: vi.fn() }));
vi.mock("./task-status-badge", () => ({ TaskStatusBadge: () => <span>Status</span> }));

const { TodoItem } = await import("./todo-item");

afterEach(() => cleanup());

describe("TodoItem", () => {
  it("links to task details without showing the old edit button", () => {
    render(<TodoItem
      todo={{
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
      }}
      dict={{
        todos: {
          form: { updateButton: "Edit task" },
          priorities: { low: "Low", medium: "Medium", high: "High" },
        },
      } as never}
    />);

    expect(screen.getByRole("link", { name: /Task title/ }).getAttribute("href")).toBe("/dashboard/tasks/44444444-4444-4444-8444-444444444444");
    expect(screen.queryByRole("button", { name: "Edit task" })).toBeNull();
  });
});
