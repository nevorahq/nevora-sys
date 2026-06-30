// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";

const changeTaskStatusAction = vi.fn();
vi.mock("@/modules/tasks/actions/change-task-status.action", () => ({ changeTaskStatusAction }));

const { TaskStatusBadge } = await import("./task-status-badge");

const TASK_ID = "44444444-4444-4444-8444-444444444444";

// Minimal slice of the dictionary the badge reads.
const dict = {
  todos: {
    statuses: { todo: "Not set", in_progress: "In progress", done: "Closed" },
    statusBadge: {
      ariaLabel: "Change task status",
      changing: "Saving status…",
      changeFailed: "Could not change status.",
    },
  },
} as never;

function getSelect() {
  return screen.getByRole("combobox", { name: "Change task status" }) as HTMLSelectElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  changeTaskStatusAction.mockResolvedValue({});
});

afterEach(() => cleanup());

describe("TaskStatusBadge", () => {
  it("shows the current status and an accessible label", () => {
    render(<TaskStatusBadge taskId={TASK_ID} status="in_progress" dict={dict} />);
    const select = getSelect();
    expect(select.value).toBe("in_progress");
    expect(select.getAttribute("aria-label")).toBe("Change task status");
  });

  it("offers exactly the three statuses", () => {
    render(<TaskStatusBadge taskId={TASK_ID} status="todo" dict={dict} />);
    const options = Array.from(getSelect().options).map((o) => o.value);
    expect(options).toEqual(["todo", "in_progress", "done"]);
  });

  it("changes the status from the card and shows the new value on success", async () => {
    render(<TaskStatusBadge taskId={TASK_ID} status="todo" dict={dict} />);
    fireEvent.change(getSelect(), { target: { value: "done" } });

    await waitFor(() => expect(changeTaskStatusAction).toHaveBeenCalledWith(TASK_ID, "done"));
    await waitFor(() => expect(getSelect().value).toBe("done"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reverts to the previous status and shows a message on error", async () => {
    changeTaskStatusAction.mockResolvedValue({ error: "boom" });
    render(<TaskStatusBadge taskId={TASK_ID} status="todo" dict={dict} />);

    fireEvent.change(getSelect(), { target: { value: "done" } });

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(getSelect().value).toBe("todo");
  });

  it("disables the control while saving", async () => {
    let resolve!: (v: { error?: string }) => void;
    changeTaskStatusAction.mockReturnValue(new Promise((r) => { resolve = r; }));

    render(<TaskStatusBadge taskId={TASK_ID} status="todo" dict={dict} />);
    fireEvent.change(getSelect(), { target: { value: "in_progress" } });

    await waitFor(() => expect(getSelect().disabled).toBe(true));

    resolve({});
    await waitFor(() => expect(getSelect().disabled).toBe(false));
  });
});
