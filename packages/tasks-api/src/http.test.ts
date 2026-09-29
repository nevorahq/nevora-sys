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

  it("accepts a project on createStandardTask and rejects a non-uuid one", () => {
    const base = { title: "Draft the brief", sourceSuggestionId: "77777777-7777-4777-8777-777777777777" };
    expect(tasksHttpRequestSchema.safeParse({
      operation: "createStandardTask",
      input: { ...base, projectId: "55555555-5555-4555-8555-555555555555" },
    }).success).toBe(true);
    expect(tasksHttpRequestSchema.safeParse({ operation: "createStandardTask", input: { ...base, projectId: null } }).success).toBe(true);
    expect(tasksHttpRequestSchema.safeParse({ operation: "createStandardTask", input: base }).success).toBe(true);
    expect(tasksHttpRequestSchema.safeParse({
      operation: "createStandardTask",
      input: { ...base, projectId: "not-a-uuid" },
    }).success).toBe(false);
  });

  it("still rejects unknown createStandardTask keys (strict wire schema)", () => {
    expect(tasksHttpRequestSchema.safeParse({
      operation: "createStandardTask",
      input: { title: "X", workspaceId: "55555555-5555-4555-8555-555555555555" },
    }).success).toBe(false);
  });
});
