import { describe, expect, it } from "vitest";
import { getAccountSchemas } from "./account.schema";

const { createAccountSchema, updateAccountSchema } = getAccountSchemas({
  nameRequired: "Name required",
  invalidType: "Invalid type",
  balanceNegative: "Starting balance cannot be negative",
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

describe("account starting balance", () => {
  it("rejects a negative starting balance on create", () => {
    const result = createAccountSchema.safeParse({
      name: "Debt Card",
      type: "card",
      initial_balance: "-360",
      currency: "MDL",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Starting balance cannot be negative");
  });

  it("rejects a negative starting balance on update", () => {
    const result = updateAccountSchema.safeParse({
      accountId: "11111111-1111-4111-8111-111111111111",
      name: "Debt Card",
      type: "card",
      initial_balance: "-1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a zero or positive starting balance", () => {
    expect(createAccountSchema.safeParse({ name: "A", type: "cash", initial_balance: "0", currency: "MDL" }).success).toBe(true);
    expect(createAccountSchema.safeParse({ name: "B", type: "cash", initial_balance: "360", currency: "MDL" }).success).toBe(true);
  });
});
