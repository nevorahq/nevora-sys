import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_FINANCIAL_STATES,
  toCanonicalFinancialState,
  type FinancialSurface,
} from "./canonical-financial-state";

/**
 * Sprint 4 — S4.2: the canonical-state mapper must be TOTAL over every real DB
 * status. A value that exists in a CHECK constraint but returns null from the
 * mapper is a surface the UI would mislabel. These derive the states from the
 * migrations and assert the mapper (and the dict labels) cover them all.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function checkValues(migrationRel: string, column: string): string[] {
  const sql = read(migrationRel);
  const m = sql.match(new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`, "i"));
  return m ? [...m[1].matchAll(/'([a-z_]+)'/gi)].map((x) => x[1]) : [];
}

const SURFACES: { surface: FinancialSurface; states: string[] }[] = [
  { surface: "transaction", states: ["posted", "planned"] },
  { surface: "subscription_cycle", states: checkValues("supabase/migrations/078_subscription_payment_cycles.sql", "status") },
  { surface: "financial_task", states: checkValues("supabase/migrations/079_financial_task_context.sql", "financial_status") },
  { surface: "suggestion", states: checkValues("supabase/migrations/097_phase_c_documents_money_subscriptions_integration.sql", "review_state") },
];

describe("canonical financial-state mapper: total over real DB states", () => {
  for (const { surface, states } of SURFACES) {
    it(`${surface}: derived at least one DB state`, () => {
      expect(states.length).toBeGreaterThan(0);
    });

    it.each(states)(`${surface}: "%s" maps to a canonical state`, (dbStatus) => {
      const canonical = toCanonicalFinancialState(surface, dbStatus);
      expect(canonical, `${surface}.${dbStatus} is unmapped`).not.toBeNull();
      expect(CANONICAL_FINANCIAL_STATES).toContain(canonical);
    });
  }

  it("returns null for an unknown status (caller falls back, never mislabels)", () => {
    expect(toCanonicalFinancialState("transaction", "banana")).toBeNull();
  });
});

describe("canonical financial-state mapper: key mappings match the contract", () => {
  it("only posted / paid become the canonical paid state", () => {
    expect(toCanonicalFinancialState("transaction", "posted")).toBe("paid");
    expect(toCanonicalFinancialState("subscription_cycle", "paid")).toBe("paid");
    expect(toCanonicalFinancialState("financial_task", "paid")).toBe("paid");
    // planned / open / detected are NOT paid
    expect(toCanonicalFinancialState("transaction", "planned")).toBe("planned");
    expect(toCanonicalFinancialState("financial_task", "open")).toBe("due");
    expect(toCanonicalFinancialState("suggestion", "detected")).toBe("detected");
  });

  it("terminal-without-payment maps to cancelled", () => {
    expect(toCanonicalFinancialState("subscription_cycle", "skipped")).toBe("cancelled");
    expect(toCanonicalFinancialState("financial_task", "dismissed")).toBe("cancelled");
    expect(toCanonicalFinancialState("suggestion", "rejected")).toBe("cancelled");
  });
});

describe("canonical labels stay in sync with the mapper", () => {
  it.each(["en", "ru", "ro"])("%s dictionary labels every canonical state", (locale) => {
    const dict = read(`shared/i18n/dictionaries/${locale}.ts`);
    const statesBlock = dict.slice(dict.indexOf("states: {"), dict.indexOf("states: {") + 400);
    for (const state of CANONICAL_FINANCIAL_STATES) {
      expect(statesBlock, `${locale} missing money.states.${state}`).toContain(`${state}:`);
    }
  });
});
