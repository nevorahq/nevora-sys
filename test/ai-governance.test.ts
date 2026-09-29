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
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next") out.push(...walk(rel));
    }
    else out.push(rel);
  }
  return out;
}

const isSource = (f: string) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);

/**
 * Every AI file: the model client + prompts, the AI module, every other file
 * that calls a model itself, and the Inbox classification step (rule-first,
 * model second) with its quota reservation.
 */
const AI_FILES = [
  ...walk("lib/ai"),
  ...walk("modules/ai"),
  "modules/moneyflow/services/ai-category-suggestion.ts",
  "modules/planner/services/detect-planner-intent.ts",
  "modules/planner/services/detect-capture-intent.ts",
  "modules/planner/services/reserve-capture-ai-call.ts",
  "modules/planner/utils/project-classification.ts",
  "modules/channels/voice/transcribe-voice.ts",
].filter(isSource);

/**
 * The Inbox steps that run the model and persist its drafts. Per the contract
 * (§3) the caller of a pure helper stores its output through the normal path;
 * here that is the capture's review queue, so these may write the capture and
 * its drafts — and nothing else outside the AI tables.
 */
const AI_PIPELINE_FILES = [
  "modules/planner/services/process-planner-entry.ts",
  "modules/planner/services/propose-tasks-from-document-capture.ts",
];

/** A provider call in source: the Anthropic client or a raw model endpoint. */
const MODEL_CALL = /getAnthropicClient\(|new Anthropic\(|api\.(?:anthropic|openai)\.com/;

/** The only tables AI may write — telemetry + review queues, never a domain fact. */
const AI_WRITABLE = ["ai_requests", "ai_insights", "ai_summaries", "ai_recommendations"];

/** What the Inbox pipeline may write on top: the capture and its drafts. */
const AI_PIPELINE_WRITABLE = [...AI_WRITABLE, "planner_entries", "planner_suggestions"];

/**
 * Tables / RPCs AI must never touch as a mutation. `subscription_payment_cycles`
 * is the only "paid" state outside the ledger since migration 115; that
 * migration dropped both payment RPCs, which stay listed so none comes back.
 */
const FORBIDDEN = [
  "money_transactions",
  "billing_subscriptions",
  "memberships",
  "subscription_payment_cycles",
  "mark_subscription_payment_paid",
  "mark_financial_task_paid",
  "category_rules",
  "changePlan",
];

/** Tables written by a `.from("x")` chained into insert/update/upsert/delete. */
function writtenTables(src: string): string[] {
  return [...src.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(/g)].map(
    (m) => m[1],
  );
}

/** Pure suggestion helpers must do zero DB writes. */
const PURE_HELPERS = [
  "modules/moneyflow/services/ai-category-suggestion.ts",
  "modules/planner/services/detect-planner-intent.ts",
];

describe("AI governance: the AI surface exists", () => {
  it("finds the AI files (guards against a silent empty scan)", () => {
    expect(AI_FILES.length).toBeGreaterThanOrEqual(15);
    for (const file of [...AI_FILES, ...AI_PIPELINE_FILES]) {
      expect(existsSync(join(ROOT, file)), `${file} is listed but missing`).toBe(true);
    }
  });

  it("scans every file that calls a model", () => {
    const callers = ["app", "lib", "modules", "platform", "shared", "apps", "packages"]
      .flatMap(walk)
      .filter(isSource)
      .filter((file) => MODEL_CALL.test(read(file)));
    expect(callers.length).toBeGreaterThan(0);
    for (const file of callers) {
      expect(AI_FILES, `${file} calls a model but is not in AI_FILES`).toContain(file);
    }
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
    for (const table of writtenTables(read(file))) {
      expect(AI_WRITABLE, `${file} writes to non-AI table "${table}"`).toContain(table);
    }
  });

  it.each(AI_FILES)("%s calls no forbidden RPC", (file) => {
    const rpcs = [...read(file).matchAll(/\.rpc\(\s*["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
    expect(rpcs).not.toContain("mark_subscription_payment_paid");
    expect(rpcs).not.toContain("mark_financial_task_paid");
  });
});

describe("AI governance: the Inbox pipeline stores drafts, never facts", () => {
  it.each(AI_PIPELINE_FILES)("%s never references a forbidden table or RPC", (file) => {
    const src = read(file);
    for (const token of FORBIDDEN) {
      expect(src, `${file} references forbidden "${token}"`).not.toContain(token);
    }
  });

  it.each(AI_PIPELINE_FILES)("%s writes only the capture, its drafts and AI tables", (file) => {
    for (const table of writtenTables(read(file))) {
      expect(AI_PIPELINE_WRITABLE, `${file} writes to "${table}"`).toContain(table);
    }
  });

  it.each(AI_PIPELINE_FILES)("%s deletes nothing and calls no RPC", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });
});

describe("AI governance: pure suggestion helpers stay write-free", () => {
  it.each(PURE_HELPERS)("%s performs no DB write", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.(insert|update|delete)\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });
});
