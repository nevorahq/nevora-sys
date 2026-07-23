import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Money safety for the inline account-creation path.
 *
 * Creating an account unblocks `Mark as paid`; it must not become a second way
 * to move money, and it must not let the client choose the currency a payment
 * will be posted in.
 */

const ROOT = process.cwd();
const action = readFileSync(
  join(ROOT, "modules/moneyflow/actions/create-account-for-obligation.action.ts"),
  "utf8",
);
const prompt = readFileSync(
  join(ROOT, "modules/moneyflow/components/inline-account-prompt.tsx"),
  "utf8",
);
const onboarding = readFileSync(
  join(ROOT, "features/onboarding/actions/create-organization.action.ts"),
  "utf8",
);
const service = readFileSync(
  join(ROOT, "modules/moneyflow/services/money-account-service.ts"),
  "utf8",
);

describe("inline account creation posts no money", () => {
  it("never writes to money_transactions or marks anything paid", () => {
    for (const src of [action, service]) {
      expect(src).not.toMatch(/from\(["']money_transactions["']\)/);
      expect(src).not.toMatch(/mark_(financial_task|subscription_payment)_paid/);
      expect(src).not.toMatch(/status:\s*["']posted["']/);
    }
  });

  it("creates the account with a zero initial balance", () => {
    expect(action).toContain("initialBalance: 0");
    expect(service).toContain("initial_balance: 0");
  });
});

describe("inline account creation cannot be steered by the client", () => {
  it("derives the currency from the obligation row, not from the form", () => {
    // The schema is the full list of accepted client fields.
    const schemaBlock = action.slice(action.indexOf("const schema"), action.indexOf("export async function"));
    expect(schemaBlock).not.toContain("currency");
    expect(action).toContain("const { currency } = obligation;");
  });

  it("does not send a currency field from the client form", () => {
    expect(prompt).not.toMatch(/<input[^>]*name="currency"/);
    // The currency input the user sees is display-only.
    expect(prompt).toContain("disabled readOnly");
  });
});

describe("inline account creation stays tenant-scoped", () => {
  it("reads every obligation with an explicit organization filter", () => {
    const lookups = action.match(/\.eq\("organization_id", organizationId\)/g) ?? [];
    expect(lookups.length).toBe(2); // financial_task + subscription_cycle
  });

  it("goes through the authorization + entitlement gate", () => {
    expect(action).toContain("requireAppAccess");
    expect(action).toContain('permission: "data.write"');
  });

  it("only accepts obligations that are still open", () => {
    expect(action).toContain('.eq("financial_status", "open")');
    expect(action).toContain('.in("status", ["planned", "task_open", "failed"])');
  });
});

describe("the default account seed cannot break organization creation", () => {
  it("runs after the RPC and is not awaited into the failure path", () => {
    const rpcIndex = onboarding.indexOf('rpc("create_organization"');
    const seedIndex = onboarding.indexOf("seedDefaultMoneyAccount(");
    expect(rpcIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeGreaterThan(rpcIndex);
  });

  it("swallows its own failures instead of surfacing an onboarding error", () => {
    // The seed returns a boolean; onboarding must not branch to an error on it.
    expect(service).toContain("): Promise<boolean>");
    expect(onboarding).not.toMatch(/seedDefaultMoneyAccount[\s\S]{0,200}?return\s*\{\s*error/);
  });

  it("never seeds a second account for an organization that already has one", () => {
    expect(service).toContain("if (existing && existing.length > 0) return false;");
  });
});
