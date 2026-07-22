import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 4 — financial-state contract coverage.
 *
 * `docs/contracts/financial-state-machine.md` maps every per-surface DB status
 * onto one canonical vocabulary. Its value is completeness: a status that exists
 * in a CHECK constraint but is missing from the mapping is exactly the drift that
 * lets two surfaces disagree about what "planned" or "paid" means. These
 * assertions derive the real states from the migration CHECK constraints and pin
 * the doc to them, so adding a DB state forces a contract update.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const doc = read("docs/contracts/financial-state-machine.md");

/**
 * Quoted values of the `CHECK (<column> IN ('a','b',…))` for a column, read from
 * a migration file. Handles multi-line IN lists.
 */
function checkValues(migrationRel: string, column: string): string[] {
  const sql = read(migrationRel);
  const re = new RegExp(`${column}\\s+IN\\s*\\(([\\s\\S]*?)\\)`, "i");
  const m = sql.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z_]+)'/gi)].map((x) => x[1]);
}

const SURFACES: Record<string, { file: string; column: string; min: number }> = {
  "subscription_payment_cycles.status": { file: "supabase/migrations/078_subscription_payment_cycles.sql", column: "status", min: 6 },
  "todos.financial_status": { file: "supabase/migrations/079_financial_task_context.sql", column: "financial_status", min: 4 },
  "financial_suggestions.review_state": { file: "supabase/migrations/097_phase_c_documents_money_subscriptions_integration.sql", column: "review_state", min: 5 },
  "document_extractions.status": { file: "supabase/migrations/051_document_to_transaction.sql", column: "status", min: 5 },
};

describe("financial-state contract: every DB status is mapped", () => {
  for (const [surface, { file, column, min }] of Object.entries(SURFACES)) {
    const values = checkValues(file, column);

    it(`derives ${surface} states from its migration`, () => {
      expect(values.length, `no CHECK values parsed for ${surface}`).toBeGreaterThanOrEqual(min);
    });

    it.each(values)(`${surface}: "%s" appears in the contract`, (value) => {
      expect(doc, `financial-state-machine.md omits ${surface} = "${value}"`).toContain(value);
    });
  }

  it("maps money_transactions.status (posted | planned)", () => {
    // 041 sets the values without a single-line CHECK; assert both explicitly.
    expect(doc).toContain("posted");
    expect(doc).toContain("planned");
  });
});

describe("financial-state contract: canonical states + invariants", () => {
  it("names all six canonical states", () => {
    for (const s of ["detected", "needs_review", "planned", "due", "paid", "cancelled"]) {
      expect(doc).toContain(s);
    }
  });

  it("states that only paid is a posted transaction", () => {
    expect(doc).toMatch(/Only\s+.?paid.?\s+is\s+a\s+posted\s+transaction/i);
  });

  it("states the non-posting invariants", () => {
    expect(doc).toMatch(/Task completion\s*≠\s*payment/i);
    expect(doc).toMatch(/Document attachment\s*≠\s*expense/i);
    expect(doc).toMatch(/Historical posted values are immutable/i);
  });

  it("is a mapping contract, not a schema change", () => {
    expect(doc).toMatch(/No column is renamed/i);
  });
});
