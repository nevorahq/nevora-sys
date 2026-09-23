import { describe, expect, it } from "vitest";
import { tasksHttpRequestSchema } from "./http";

describe("Tasks HTTP request schema", () => {
  it("accepts an explicit list scope", () => {
    const parsed = tasksHttpRequestSchema.safeParse({
      operation: "listTasks",
      input: { scope: "organization", sort: "smart_default" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown list scope", () => {
    const parsed = tasksHttpRequestSchema.safeParse({
      operation: "listTasks",
      input: { scope: "everything" },
    });
    expect(parsed.success).toBe(false);
  });
});
