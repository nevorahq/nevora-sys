import { describe, expect, it } from "vitest";
import { requestAccountDeletionSchema } from "./delete-account.schema";

describe("requestAccountDeletionSchema", () => {
  it("accepts a confirmation with optional password and reason", () => {
    const parsed = requestAccountDeletionSchema.safeParse({
      confirmation: "me@example.com",
      password: "secret",
      reason: "leaving",
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults password and reason to empty strings", () => {
    const parsed = requestAccountDeletionSchema.safeParse({ confirmation: "me@example.com" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.password).toBe("");
      expect(parsed.data.reason).toBe("");
    }
  });

  it("rejects an empty confirmation", () => {
    const parsed = requestAccountDeletionSchema.safeParse({ confirmation: "  " });
    expect(parsed.success).toBe(false);
  });

  it("rejects an over-long reason", () => {
    const parsed = requestAccountDeletionSchema.safeParse({
      confirmation: "me@example.com",
      reason: "x".repeat(501),
    });
    expect(parsed.success).toBe(false);
  });
});
