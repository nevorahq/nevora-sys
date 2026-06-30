// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent, within } from "@testing-library/react";

const assignTaskAction = vi.fn();
const unassignTaskAction = vi.fn();
vi.mock("../actions/assign-task.action", () => ({ assignTaskAction, unassignTaskAction }));

const { TaskAssigneesManager } = await import("./task-assignees-manager");

const dict = {
  todos: {
    assignees: {
      title: "Assignees",
      creatorBadge: "Creator",
      addLabel: "Add assignee",
      addPlaceholder: "Add a member…",
      removeLabel: "Remove {name} from assignees",
      removeSelf: "Remove yourself",
      lastAssigneeHint: "A task must have at least one assignee",
      noMembers: "No members available to add",
      adding: "Adding…",
      removing: "Removing…",
      addFailed: "Couldn't add assignee.",
      removeFailed: "Couldn't remove assignee.",
    },
    activity: { unknownUser: "Someone" },
  },
} as never;

const ALEX = "alex";
const MARIA = "maria";
const BORIS = "boris";
const TASK = "task-1";

const members = [
  { id: ALEX, name: "Alex" },
  { id: MARIA, name: "Maria" },
  { id: BORIS, name: "Boris" },
];

function renderManager(opts: { canManage?: boolean; assignees?: { userId: string; name: string | null; isCreator: boolean }[]; currentUserId?: string } = {}) {
  return render(
    <TaskAssigneesManager
      taskId={TASK}
      assignees={opts.assignees ?? [
        { userId: ALEX, name: "Alex", isCreator: true },
        { userId: MARIA, name: "Maria", isCreator: false },
      ]}
      members={members}
      canManage={opts.canManage ?? true}
      currentUserId={opts.currentUserId ?? ALEX}
      dict={dict}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  assignTaskAction.mockResolvedValue({});
  unassignTaskAction.mockResolvedValue({});
});

afterEach(() => cleanup());

describe("TaskAssigneesManager", () => {
  it("lists assignees and marks the creator", () => {
    renderManager();
    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("Maria")).toBeTruthy();
    expect(screen.getByText("Creator")).toBeTruthy();
  });

  it("offers only members not already assigned in the dropdown", () => {
    renderManager();
    const select = screen.getByRole("combobox", { name: "Add assignee" }) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value).filter(Boolean);
    expect(values).toEqual([BORIS]); // Alex + Maria already assigned
  });

  it("adds an assignee from the dropdown", async () => {
    renderManager();
    const select = screen.getByRole("combobox", { name: "Add assignee" });
    fireEvent.change(select, { target: { value: BORIS } });

    await waitFor(() => expect(assignTaskAction).toHaveBeenCalledWith(TASK, BORIS));
    await waitFor(() => expect(screen.getByText("Boris")).toBeTruthy());
  });

  it("removes an assignee", async () => {
    renderManager();
    const mariaRow = screen.getByText("Maria").closest("li")!;
    fireEvent.click(within(mariaRow).getByRole("button", { name: "Remove Maria from assignees" }));

    await waitFor(() => expect(unassignTaskAction).toHaveBeenCalledWith(TASK, MARIA));
  });

  it("restores previous state and shows an error when removing fails", async () => {
    unassignTaskAction.mockResolvedValue({ error: "boom" });
    renderManager();
    const mariaRow = screen.getByText("Maria").closest("li")!;
    fireEvent.click(within(mariaRow).getByRole("button", { name: "Remove Maria from assignees" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("Maria")).toBeTruthy(); // restored
  });

  it("never lets the last assignee be removed", () => {
    renderManager({ assignees: [{ userId: ALEX, name: "Alex", isCreator: true }] });
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("hides management for users without rights but still lets them remove themselves", () => {
    renderManager({
      canManage: false,
      currentUserId: MARIA,
      assignees: [
        { userId: ALEX, name: "Alex", isCreator: true },
        { userId: MARIA, name: "Maria", isCreator: false },
      ],
    });
    // No add dropdown for non-managers.
    expect(screen.queryByRole("combobox", { name: "Add assignee" })).toBeNull();
    // Maria can still remove herself, but not Alex.
    expect(screen.getByRole("button", { name: "Remove yourself" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Alex from assignees" })).toBeNull();
  });
});
