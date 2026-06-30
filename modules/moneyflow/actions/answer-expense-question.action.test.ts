import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/shared/i18n/dictionaries/en";

const createClient = vi.fn();
const requireOrg = vi.fn();
const getDictionary = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrg }));
vi.mock("@/shared/i18n/get-dictionary", () => ({ getDictionary }));

const { answerExpenseQuestionAction } = await import("./answer-expense-question.action");

function makeSupabase() {
  const filters: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    for (const method of ["eq", "gte", "lt", "is"]) {
      builder[method] = vi.fn((column: string, value: unknown) => {
        filters.push([table, column, value]);
        return builder;
      });
    }
    const result = () => {
      if (table === "money_categories") {
        return Promise.resolve({
          data: [{ id: "category-transport", name: "Transport", system_key: "transport" }],
          error: null,
        });
      }
      if (table === "expense_contexts") {
        return Promise.resolve({ data: [{ id: "context-work", name: "Work", slug: "work" }], error: null });
      }
      return Promise.resolve({
        data: [
          { amount: "25.50", currency: "EUR" },
          { amount: "10.00", currency: "EUR" },
        ],
        error: null,
      });
    };
    (builder as { then: unknown }).then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      result().then(resolve, reject);
    return builder;
  });
  return { client: { from } as never, filters };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOrg.mockResolvedValue({ org: { id: "org-1" } });
  getDictionary.mockResolvedValue({ dict: en, locale: "en" });
});

describe("answerExpenseQuestionAction", () => {
  it("calculates category totals from posted DB rows without asking an LLM", async () => {
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase.client);

    const result = await answerExpenseQuestionAction("Сколько потрачено на транспорт за 30 дней?");

    expect(result.answer).toContain("€35.50");
    expect(result.answer).toContain("last 30 days");
    expect(supabase.filters).toContainEqual(["money_transactions", "category_id", "category-transport"]);
    expect(supabase.filters).toContainEqual(["money_transactions", "status", "posted"]);
  });

  it("scopes the answer to the selected month window from the history navigator", async () => {
    const supabase = makeSupabase();
    createClient.mockResolvedValue(supabase.client);

    const result = await answerExpenseQuestionAction("Сколько потрачено на транспорт", {
      monthStart: "2026-05-01",
      nextMonthStart: "2026-06-01",
      label: "May 2026",
    });

    expect(result.answer).toContain("in May 2026");
    // Bounded month window: both lower (gte) and upper (lt) bounds applied.
    expect(supabase.filters).toContainEqual(["money_transactions", "transaction_date", "2026-05-01"]);
    expect(supabase.filters).toContainEqual(["money_transactions", "transaction_date", "2026-06-01"]);
  });

  it("rejects an empty question before loading auth context", async () => {
    await expect(answerExpenseQuestionAction("  ")).resolves.toEqual({
      error: "Ask a short question about your expenses.",
    });
    expect(requireOrg).not.toHaveBeenCalled();
  });
});
