export function normalizeTaskPreview<T extends Record<string, unknown>>(task: T) {
  return {
    ...task,
    status: task.status ?? (task.is_completed ? "done" : "todo"),
    priority: task.priority ?? "medium",
    description: task.description ?? "",
    recurrence: task.recurrence ?? "none",
    assignees: [],
    comments: [],
    relations: [],
  };
}
