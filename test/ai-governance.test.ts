import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AI governance invariants (Sprint 5 — S5.1). Enforces
 * `docs/contracts/ai-governance.md`: AI may classify/extract/suggest, but must
 * never — on its own — post money, mark anything paid, change a plan or
 * permissions, delete critical data, or create org-wide rules.
 *
 * Source-level, like the financial invariants: the failure mode is a NEW AI file
 * gaining a forbidden side effect, which is visible in the source before it can
 * ever run. If AI legitimately needs to write a domain table, it doesn't — it
 * routes through the module service; do not relax these tests.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

/** Every AI file: the AI module + the two pure suggestion helpers. */
const AI_FILES = [
  ...walk("modules/ai"),
  "modules/moneyflow/services/ai-category-suggestion.ts",
  "modules/planner/services/detect-planner-intent.ts",
].filter((f) => f.endsWith(".ts") && !/\.test\.ts$/.test(f));

/** The only tables AI may write — telemetry + review queues, never a domain fact. */
const AI_WRITABLE = ["ai_requests", "ai_insights", "ai_summaries", "ai_recommendations"];

/** Tables / RPCs AI must never touch as a mutation. */
const FORBIDDEN = [
  "money_transactions",
  "billing_subscriptions",
  "memberships",
  "mark_subscription_payment_paid",
  "mark_financial_task_paid",
  "category_rules",
  "changePlan",
];

/** Pure suggestion helpers must do zero DB writes. */
const PURE_HELPERS = [
  "modules/moneyflow/services/ai-category-suggestion.ts",
  "modules/planner/services/detect-planner-intent.ts",
];

describe("AI governance: the AI surface exists", () => {
  it("finds the AI files (guards against a silent empty scan)", () => {
    expect(AI_FILES.length).toBeGreaterThanOrEqual(8);
  });
});

describe("AI governance: no forbidden side effects", () => {
  it.each(AI_FILES)("%s never references a forbidden table or RPC", (file) => {
    const src = read(file);
    for (const token of FORBIDDEN) {
      expect(src, `${file} references forbidden "${token}"`).not.toContain(token);
    }
  });

  it.each(AI_FILES)("%s writes only to AI-owned tables", (file) => {
    const src = read(file);
    // Tables that are WRITTEN: a `.from("x")` chained into insert/update/delete.
    const writes = [...src.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.(insert|update|delete)\(/g)]
      .map((m) => m[1]);
    for (const table of writes) {
      expect(AI_WRITABLE, `${file} writes to non-AI table "${table}"`).toContain(table);
    }
  });

  it.each(AI_FILES)("%s calls no forbidden RPC", (file) => {
    const rpcs = [...read(file).matchAll(/\.rpc\(\s*["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
    expect(rpcs).not.toContain("mark_subscription_payment_paid");
    expect(rpcs).not.toContain("mark_financial_task_paid");
  });
});

describe("AI governance: pure suggestion helpers stay write-free", () => {
  it.each(PURE_HELPERS)("%s performs no DB write", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.(insert|update|delete)\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });
});
