import { describe, expect, it } from "vitest";
import {
  isSubscriptionsRuntimeReady,
  readSubscriptionsRuntimeEnvironment,
  SubscriptionsRuntimeConfigurationError,
} from "./environment";

const validEnvironment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUBSCRIPTIONS_SERVICE_AUTH_SECRET: "subscriptions-service-secret-that-is-long-enough",
  TASKS_API_URL: "https://tasks.example.test",
  TASKS_SERVICE_AUTH_SECRET: "tasks-service-secret-that-is-long-enough-too",
} as unknown as NodeJS.ProcessEnv;

describe("Subscriptions runtime environment", () => {
  it("reads the Supabase URL from a server-only runtime variable", () => {
    expect(readSubscriptionsRuntimeEnvironment(validEnvironment)).toMatchObject({
      supabaseUrl: "https://example.supabase.co",
      tasksApiUrl: "https://tasks.example.test",
    });
    expect(isSubscriptionsRuntimeReady(validEnvironment)).toBe(true);
  });

  it("does not accept a build-time NEXT_PUBLIC Supabase URL", () => {
    expect(() => readSubscriptionsRuntimeEnvironment({
      ...validEnvironment,
      SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_URL: "https://frozen-at-build.example.co",
    })).toThrow(SubscriptionsRuntimeConfigurationError);
  });

  it("requires Tasks connectivity — payment-task provisioning has nowhere else to go", () => {
    expect(() => readSubscriptionsRuntimeEnvironment({
      ...validEnvironment,
      TASKS_API_URL: undefined,
    })).toThrow(SubscriptionsRuntimeConfigurationError);
    expect(() => readSubscriptionsRuntimeEnvironment({
      ...validEnvironment,
      TASKS_SERVICE_AUTH_SECRET: undefined,
    })).toThrow(SubscriptionsRuntimeConfigurationError);
  });
});
