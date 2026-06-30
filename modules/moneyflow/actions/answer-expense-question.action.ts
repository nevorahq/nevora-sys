"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/require-org";
import { getDictionary } from "@/shared/i18n/get-dictionary";

const questionSchema = z.string().trim().min(3).max(300);

export interface ExpenseQuestionPeriod {
  monthStart: string;
  nextMonthStart: string;
  label: string;
}

export async function answerExpenseQuestionAction(
  question: string,
  period?: ExpenseQuestionPeriod,
): Promise<{ answer?: string; error?: string }> {
  const { dict } = await getDictionary();
  const q = dict.money.question;

  const parsed = questionSchema.safeParse(question);
  if (!parsed.success) return { error: q.askShort };

  const ctx = await requireOrg();
  const supabase = await createClient();
  const normalizedQuestion = normalizeText(parsed.data);
  const [categoriesResult, contextsResult] = await Promise.all([
    supabase
      .from("money_categories")
      .select("id, name, system_key")
      .eq("organization_id", ctx.org.id)
      .eq("type", "expense")
      .eq("is_active", true),
    supabase
      .from("expense_contexts")
      .select("id, name, slug")
      .eq("organization_id", ctx.org.id)
      .eq("is_active", true),
  ]);

  const categories = (categoriesResult.data as Array<{ id: string; name: string; system_key: string | null }> | null) ?? [];
  const contexts = (contextsResult.data as Array<{ id: string; name: string; slug: string }> | null) ?? [];
  const category = categories.find((candidate) => normalizedQuestion.includes(normalizeText(candidate.name)))
    ?? categories.find((candidate) => candidate.system_key != null && questionMentionsSystemKey(normalizedQuestion, candidate.system_key));
  const context = contexts.find((candidate) =>
    normalizedQuestion.includes(normalizeText(candidate.name)) || questionMentionsContext(normalizedQuestion, candidate.slug),
  );

  const { startDate, endDate, periodLabel } = resolvePeriod(normalizedQuestion, period, q);
  let query = supabase
    .from("money_transactions")
    .select("amount, currency")
    .eq("organization_id", ctx.org.id)
    .eq("type", "expense")
    .eq("status", "posted")
    .gte("transaction_date", startDate)
    .is("deleted_at", null);

  // Upper bound only for a bounded window (a specific month); the "last 30 days"
  // path runs up to today and stays open-ended.
  if (endDate) query = query.lt("transaction_date", endDate);
  if (category) query = query.eq("category_id", category.id);
  if (context) query = query.eq("expense_context_id", context.id);

  const { data, error } = await query;
  if (error) {
    console.error("answerExpenseQuestion error:", error.message);
    return { error: q.loadError };
  }

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const currency = row.currency as string;
    totals.set(currency, (totals.get(currency) ?? 0) + Number(row.amount));
  }

  const scope = [category?.name, context?.name].filter(Boolean).join(" · ") || q.allExpenses;
  if (totals.size === 0) {
    return { answer: fill(q.answerNone, { scope, period: periodLabel }) };
  }

  const totalLabel = [...totals.entries()]
    .map(([currency, amount]) => formatAmount(amount, currency))
    .join(" + ");
  const result = fill(q.answerResult, { scope, total: totalLabel, period: periodLabel });
  const counted = fill(q.countSuffix, { count: String(data?.length ?? 0) });
  return { answer: `${result} ${counted}` };
}

type QuestionDict = Awaited<ReturnType<typeof getDictionary>>["dict"]["money"]["question"];

/**
 * Decide the date window for the answer:
 *  - "last 30 days" phrasing overrides everything (open-ended up to today);
 *  - otherwise the selected-month window from the history navigator;
 *  - otherwise the current UTC month.
 */
function resolvePeriod(
  question: string,
  period: ExpenseQuestionPeriod | undefined,
  q: QuestionDict,
): { startDate: string; endDate: string | null; periodLabel: string } {
  if (/30\s*(days|дн|zile)/i.test(question)) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 30);
    return { startDate: start.toISOString().slice(0, 10), endDate: null, periodLabel: q.periodLast30 };
  }
  if (period) {
    return {
      startDate: period.monthStart,
      endDate: period.nextMonthStart,
      periodLabel: `${q.periodInMonth} ${period.label}`,
    };
  }
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  return { startDate, endDate, periodLabel: q.periodThisMonth };
}

/** Replace {key} placeholders in a localized template. */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

function questionMentionsSystemKey(question: string, key: string): boolean {
  const aliases: Record<string, string[]> = {
    food: ["food", "еда", "питание", "mancare"],
    transport: ["transport", "такси", "транспорт"],
    software: ["software", "saas", "софт"],
    office: ["office", "офис", "birou"],
    taxes: ["tax", "налог", "impozit"],
    health: ["health", "здоров", "аптек", "sanatate"],
    home: ["home", "дом", "casa"],
    marketing: ["marketing", "маркетинг", "реклам"],
    travel: ["travel", "командиров", "calator"],
    subscriptions: ["subscription", "подпис", "abonament"],
    other: ["other", "прочее", "другое"],
  };
  return (aliases[key] ?? [key]).some((alias) => question.includes(alias));
}

function questionMentionsContext(question: string, slug: string): boolean {
  const aliases: Record<string, string[]> = {
    work: ["work", "business", "рабоч", "бизнес"],
    personal: ["personal", "личн"],
    family: ["family", "семейн", "семья"],
  };
  return (aliases[slug] ?? [slug]).some((alias) => question.includes(alias));
}

function normalizeText(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
