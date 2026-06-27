import { describe, expect, it } from "vitest";
import { getAccountSchemas } from "./account.schema";

const { createAccountSchema } = getAccountSchemas({
  nameRequired: "Name required",
  invalidType: "Invalid type",
});

describe("createAccountSchema currency", () => {
  it("accepts a supported selected currency", () => {
    expect(createAccountSchema.parse({
      name: "USD Card",
      type: "card",
      initial_balance: "0",
      currency: "USD",
    }).currency).toBe("USD");
  });

  it("stores the Russian ruble under the current RUB ISO code", () => {
    expect(createAccountSchema.parse({
      name: "RUR Account",
      type: "cash",
      initial_balance: "0",
      currency: "RUB",
    }).currency).toBe("RUB");
  });

  it("rejects an unsupported currency", () => {
    expect(createAccountSchema.safeParse({
      name: "Unknown Card",
      type: "card",
      initial_balance: "0",
      currency: "RON",
    }).success).toBe(false);
  });
});
