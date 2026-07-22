import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase A release invariants — the product promises we must never silently break.
 *
 * These assert against SOURCE (migration SQL + module source) rather than a live
 * database. That is a deliberate trade-off:
 *
 *   - The invariants are structural ("this RPC writes only to `notifications`"),
 *     so structure is the honest thing to assert.
 *   - They run in CI with no Postgres, on every PR, and fail the moment a *new*
 *     migration or action introduces the forbidden side effect.
 *
 * They do NOT replace an end-to-end check against a real database — see
 * `docs/release/smoke-test-checklist.md` for the behavioural counterparts that
 * must be exercised manually before release.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Migration filenames in applied order (000_, 001_, … 097_; 054_ is a known gap). */
function migrationsInOrder(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * The body of the LAST `CREATE OR REPLACE FUNCTION public.<name>` across all
 * migrations — i.e. the definition actually live on the database. Reading only
 * the first definition would miss a later migration that redefines the function
 * and adds a side effect. (`mark_all_visible_notifications_read` is redefined in
 * 075 after 074, so this matters today, not hypothetically.)
 */
function liveFunctionBody(name: string): string {
  let body: string | null = null;

  // Must anchor on CREATE: the same file also contains
  // `GRANT EXECUTE ON FUNCTION public.<name>(...)`, and matching that instead
  // yields a body of "COMMIT;" — which vacuously passes every "does not write
  // to X" assertion below.
  const create = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${name}\\s*\\(`, "gi");

  for (const file of migrationsInOrder()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const match of sql.matchAll(create)) {
      const from = match.index!;
      const end = sql.indexOf("$$;", from);
      body = sql.slice(from, end === -1 ? sql.length : end);
    }
  }

  if (body === null) throw new Error(`No CREATE FUNCTION found for public.${name}`);
  // Sanity: a real plpgsql body, not a GRANT line or a truncated slice.
  if (!/LANGUAGE\s+plpgsql/i.test(body)) {
    throw new Error(`Resolved body for public.${name} is not a plpgsql function definition`);
  }
  return body;
}

/** Tables a business obligation lives in. Writing to any of these = "resolving". */
const OBLIGATION_TABLES = [
  "todos",
  "action_items",
  "subscriptions",
  "subscription_payment_cycles",
  "money_transactions",
  "documents",
];

describe("notification lifecycle: read is NOT resolved", () => {
  // Invariant: marking notifications as read is a UI-state change. It must never
  // resolve an overdue task, a payment obligation, a subscription renewal, a
  // document review, or a billing/security warning.
  const body = liveFunctionBody("mark_all_visible_notifications_read");

  it("the live RPC updates only public.notifications", () => {
    const writes = [...body.matchAll(/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(?:public\.)?(\w+)/gi)]
      .map((m) => m[1].toLowerCase());

    expect(writes.length).toBeGreaterThan(0);
    expect(writes).toEqual(writes.filter((t) => t === "notifications"));
  });

  it.each(OBLIGATION_TABLES)("the live RPC never writes to %s", (table) => {
    expect(body).not.toMatch(new RegExp(`(UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+(public\\.)?${table}\\b`, "i"));
  });

  it("single-notification read is equally side-effect free", () => {
    const single = liveFunctionBody("mark_notification_read");
    for (const table of OBLIGATION_TABLES) {
      expect(single).not.toMatch(new RegExp(`(UPDATE|INSERT\\s+INTO|DELETE\\s+FROM)\\s+(public\\.)?${table}\\b`, "i"));
    }
  });
});

describe("subscription payment: mark as paid is idempotent", () => {
  const body = liveFunctionBody("mark_subscription_payment_paid");

  it("locks the cycle row before deciding (no double-post under a double click)", () => {
    expect(body).toMatch(/FOR\s+UPDATE/i);
  });

  it("returns early with already_paid when the cycle is already paid", () => {
    expect(body).toMatch(/IF\s+v_cycle\.status\s*=\s*'paid'\s+THEN/i);
    expect(body).toMatch(/'already_paid',\s*true/i);
  });

  it("the expense is keyed so a retry cannot duplicate it", () => {
    const schema = read("supabase/migrations/078_subscription_payment_cycles.sql");
    expect(schema).toContain("UNIQUE (organization_id, idempotency_key)");
    expect(schema).toContain("UNIQUE (organization_id, subscription_id, billing_period_key)");
  });
});

describe("confirm-first finance: nothing posts money implicitly", () => {
  // A posted money transaction may only originate from an explicit user
  // confirmation or an already-approved idempotent workflow (mark as paid).
  const forbidden = /\.from\(\s*["'`]money_transactions["'`]\s*\)\s*[\s\S]{0,80}?\.insert\(/;

  it("creating a subscription posts no transaction", () => {
    expect(read("modules/subtracker/actions/create-subscription.action.ts")).not.toMatch(forbidden);
  });

  it("attaching a document to a subscription posts no transaction", () => {
    expect(read("app/api/subscriptions/[subscriptionId]/document/route.ts")).not.toMatch(forbidden);
  });

  it("attaching a document to a task posts no transaction", () => {
    expect(read("app/api/tasks/[taskId]/document/route.ts")).not.toMatch(forbidden);
  });

  it("completing a task posts no transaction and marks nothing paid", () => {
    const src = read("modules/tasks/actions/change-task-status.action.ts");
    expect(src).not.toMatch(forbidden);
    expect(src).not.toMatch(/mark_subscription_payment_paid|status:\s*["'`]paid["'`]/);
  });

  it("the daily subscription sweep repairs only — it never posts an expense", () => {
    const src = read("modules/subtracker/services/sweep-subscription-payment-workflow.ts");
    expect(src).not.toMatch(forbidden);
    expect(src).not.toMatch(/mark_subscription_payment_paid/);
  });

  it("document extraction produces a review suggestion, never a posted transaction", () => {
    // Posting is the job of confirmFinancialSuggestion (explicit user confirm).
    expect(read("modules/documents/actions/extract-document.action.ts")).not.toMatch(forbidden);
    const service = read("modules/documents/services/document-extraction-service.ts");
    expect(service).not.toMatch(/createDraftTransactionFromDocument/);
    expect(service).not.toMatch(/\.from\(["'`]money_transactions["'`]\)\.insert/);
  });
});

// Sprint 4 unit 4.2 — idempotency & concurrency proof. The subscription path is
// covered above; these extend the same guarantee to the financial-task path and
// pin FX-history immutability, so a repeat click or a rate change cannot corrupt
// the ledger.
describe("financial task payment: mark as paid is idempotent", () => {
  const body = liveFunctionBody("mark_financial_task_paid");

  it("locks the task row before deciding (no double-post under a double click)", () => {
    expect(body).toMatch(/FOR\s+UPDATE/i);
  });

  it("returns the existing transaction when already paid — no second post", () => {
    expect(body).toMatch(/financial_status\s*=\s*'paid'/i);
    expect(body).toMatch(/'already_paid',\s*true/i);
    expect(body).toMatch(/financial_transaction_id/i);
  });

  it("only pays a task that is currently open", () => {
    expect(body).toMatch(/financial_status\s*<>\s*'open'/i);
  });

  it("keeps one financial task per source obligation (one obligation, one task)", () => {
    const sql = read("supabase/migrations/099_planner_confirmation_exactly_once.sql");
    expect(sql).toContain("todos_financial_source_unique_idx");
    expect(sql).toMatch(/organization_id,\s*financial_source_type,\s*financial_source_id/i);
  });
});

describe("financial history is immutable under FX rate changes", () => {
  // A posted transaction snapshots its own rate; changing the org's current rate
  // later must never rewrite what already happened.
  const sql = read("supabase/migrations/107_organization_exchange_rates_and_cross_currency_transfers.sql");

  it("snapshots the effective + reference rate on the posted transaction", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS effective_exchange_rate/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reference_exchange_rate/i);
  });

  it("states that later rate changes never rewrite financial history", () => {
    expect(sql).toMatch(/never rewrite financial history/i);
  });
});
