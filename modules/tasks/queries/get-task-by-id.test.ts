import { describe, expect, it } from "vitest";
import { normalizeTaskPreview } from "./normalize-task-preview";

describe("task preview query contract", () => {
  it("keeps the preview's required fallback values stable for legacy task rows", () => {
    const legacyTask = { is_completed: false, priority: null, description: null, recurrence: null };
    const normalized = normalizeTaskPreview(legacyTask);
    expect(normalized).toMatchObject({ status: "todo", priority: "medium", description: "", recurrence: "none" });
  });
});
