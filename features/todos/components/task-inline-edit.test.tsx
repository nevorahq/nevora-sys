// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateTaskInlineAction = vi.fn();
vi.mock("../actions/update-task-inline.action", () => ({ updateTaskInlineAction }));

const {
  InlineTaskDescription,
  InlineTaskTitle,
  TaskEditModeButton,
  TaskInlineEditProvider,
} = await import("./task-inline-edit");

const TASK_ID = "44444444-4444-4444-8444-444444444444";
const dict = {
  todos: {
    inlineEdit: {
      edit: "Edit",
      done: "Finish editing",
      editTitle: "Edit task title",
      editDescription: "Edit task description",
      addDescription: "Add description",
      saving: "Saving…",
      saveFailed: "Could not save",
      titleRequired: "Title cannot be empty",
    },
  },
} as never;

function renderEditor(description = "Initial description") {
  render(
    <TaskInlineEditProvider taskId={TASK_ID} initialTitle="Initial title" initialDescription={description} canEdit dict={dict}>
      <TaskEditModeButton />
      <InlineTaskTitle />
      <InlineTaskDescription />
      <button type="button">Outside</button>
    </TaskInlineEditProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  updateTaskInlineAction.mockImplementation((_id: string, _field: string, value: string) =>
    Promise.resolve({ value }),
  );
});

afterEach(() => cleanup());

describe("task inline editing", () => {
  it("saves title when clicking outside its block", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Edit task title" }));
    const input = screen.getByRole("textbox", { name: "Edit task title" });
    await user.clear(input);
    await user.type(input, "Updated title");
    await user.click(screen.getByRole("button", { name: "Outside" }));

    await waitFor(() => expect(updateTaskInlineAction).toHaveBeenCalledWith(TASK_ID, "title", "Updated title"));
    await waitFor(() => expect(screen.getByText("Updated title")).toBeTruthy());
  });

  it("saves an added description when clicking outside its block", async () => {
    const user = userEvent.setup();
    renderEditor("");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Edit task description" }));
    const textarea = screen.getByRole("textbox", { name: "Edit task description" });
    await user.type(textarea, "New description");
    await user.click(screen.getByRole("button", { name: "Outside" }));

    await waitFor(() => expect(updateTaskInlineAction).toHaveBeenCalledWith(TASK_ID, "description", "New description"));
    await waitFor(() => expect(screen.getByText("New description")).toBeTruthy());
  });

  it("keeps an invalid empty title open and shows an error", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Edit task title" }));
    await user.clear(screen.getByRole("textbox", { name: "Edit task title" }));
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Title cannot be empty");
    expect(screen.getByRole("textbox", { name: "Edit task title" })).toBeTruthy();
    expect(updateTaskInlineAction).not.toHaveBeenCalled();
  });

  it("keeps the field open with its draft when saving fails", async () => {
    updateTaskInlineAction.mockResolvedValue({ error: "boom" });
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Edit task title" }));
    const input = screen.getByRole("textbox", { name: "Edit task title" });
    await user.clear(input);
    await user.type(input, "Unsaved title");
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Could not save");
    expect((screen.getByRole("textbox", { name: "Edit task title" }) as HTMLInputElement).value).toBe("Unsaved title");
  });

  it("finishes the global edit mode while autosaving the active field", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Edit task title" }));
    const input = screen.getByRole("textbox", { name: "Edit task title" });
    await user.clear(input);
    await user.type(input, "Saved before finish");
    await user.click(screen.getByRole("button", { name: "Finish editing" }));

    await waitFor(() => expect(updateTaskInlineAction).toHaveBeenCalledWith(TASK_ID, "title", "Saved before finish"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy());
  });
});
