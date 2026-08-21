import { describe, expect, it } from "vitest";
import {
  isTasksRuntimeReady,
  readTasksRuntimeEnvironment,
  TasksRuntimeConfigurationError,
} from "./environment";

const validEnvironment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  TASKS_SERVICE_AUTH_SECRET: "tasks-service-secret-that-is-long-enough",
} as unknown as NodeJS.ProcessEnv;

describe("Tasks runtime environment", () => {
  it("reads the Supabase URL from a server-only runtime variable", () => {
    expect(readTasksRuntimeEnvironment(validEnvironment)).toMatchObject({
      supabaseUrl: "https://example.supabase.co",
    });
    expect(isTasksRuntimeReady(validEnvironment)).toBe(true);
  });

  it("does not accept a build-time NEXT_PUBLIC Supabase URL", () => {
    expect(() => readTasksRuntimeEnvironment({
      ...validEnvironment,
      SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_URL: "https://frozen-at-build.example.co",
    })).toThrow(TasksRuntimeConfigurationError);
  });
});
