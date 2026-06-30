// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { todoUiReducer, type setFilter } from "@/store/slices/todo-ui.slice";

// Keep the test focused on filtering: stub the heavy child trees.
vi.mock("./todo-item", () => ({
  TodoItem: ({ todo }: { todo: { id: string; title: string } }) => (
    <div data-testid="todo-item">{todo.title}</div>
  ),
}));
vi.mock("./todo-filters", () => ({ TodoFilters: () => <div /> }));
vi.mock("./todo-empty-state", () => ({ TodoEmptyState: () => <div data-testid="empty" /> }));

const { TodoList } = await import("./todo-list");

type Filter = Parameters<typeof setFilter>[0];

function makeTodo(id: string, status: string) {
  return { id, title: `task-${id}`, description: "", status, is_completed: status === "done", priority: "medium" };
}

const todos = [
  makeTodo("a", "todo"),
  makeTodo("b", "in_progress"),
  makeTodo("c", "done"),
] as never;

function renderWithFilter(filter: Filter) {
  const store = configureStore({
    reducer: { todoUi: todoUiReducer },
    preloadedState: { todoUi: { filter, searchQuery: "", selectedTodoId: null } },
  });
  return render(
    <Provider store={store}>
      <TodoList todos={todos} dict={{} as never} />
    </Provider>,
  );
}

afterEach(() => cleanup());

describe("TodoList filtering by status", () => {
  it("Active filter shows non-done tasks (todo + in_progress)", () => {
    renderWithFilter("active");
    const titles = screen.getAllByTestId("todo-item").map((n) => n.textContent);
    expect(titles).toEqual(["task-a", "task-b"]);
  });

  it("Completed filter shows only done tasks", () => {
    renderWithFilter("completed");
    const titles = screen.getAllByTestId("todo-item").map((n) => n.textContent);
    expect(titles).toEqual(["task-c"]);
  });

  it("All filter shows every task", () => {
    renderWithFilter("all");
    expect(screen.getAllByTestId("todo-item")).toHaveLength(3);
  });
});
