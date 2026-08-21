import { describe, expect, it } from "vitest";
import {
  isFinanceRuntimeReady,
  readFinanceRuntimeEnvironment,
  FinanceRuntimeConfigurationError,
} from "./environment";

const validEnvironment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  FINANCE_SERVICE_AUTH_SECRET: "finance-service-secret-that-is-long-enough",
} as unknown as NodeJS.ProcessEnv;

describe("Finance runtime environment", () => {
  it("reads the Supabase URL from a server-only runtime variable", () => {
    expect(readFinanceRuntimeEnvironment(validEnvironment)).toMatchObject({
      supabaseUrl: "https://example.supabase.co",
    });
    expect(isFinanceRuntimeReady(validEnvironment)).toBe(true);
  });

  it("does not accept a build-time NEXT_PUBLIC Supabase URL", () => {
    expect(() => readFinanceRuntimeEnvironment({
      ...validEnvironment,
      SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_URL: "https://frozen-at-build.example.co",
    })).toThrow(FinanceRuntimeConfigurationError);
  });
});
