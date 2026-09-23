import { describe, expect, it } from "vitest";
import type { Task } from "@nevora/tasks-contracts";
import { taskToTodo } from "./task-to-todo";

const base = {
  id: "t-1",
  organization_id: "org-1",
  workspace_id: "ws-1",
  created_by: null,
  updated_by: null,
  title: "Read the lease",
  description: "",
  status: "todo",
  priority: "medium",
  due_date: null,
  recurrence: "none",
  recurrence_source_id: null,
  position: null,
  is_completed: false,
  created_at: "2026-09-23T00:00:00Z",
  updated_at: "2026-09-23T00:00:00Z",
  deleted_at: null,
} satisfies Task;

describe("taskToTodo", () => {
  it("rebuilds the nested project from the view's flat columns", () => {
    const todo = taskToTodo({
      ...base,
      project_id: "p-1",
      project_name: "Launch",
      project_color: "#aa00ff",
      project_status: "paused",
    });
    expect(todo.project).toEqual({ id: "p-1", name: "Launch", color: "#aa00ff", status: "paused" });
    expect(todo).not.toHaveProperty("project_name");
  });

  it("leaves project null for a task without one", () => {
    expect(taskToTodo({ ...base, project_id: null }).project).toBeNull();
  });
});
