import type { PlannerIntentDetectionResult } from "../types/planner.types";
import { PLANNER_DESCRIPTION_MAX_LENGTH } from "../schemas/planner-suggestion.schema";

/**
 * Deterministic, no-AI intent normalizer.
 *
 * This is NOT a second planner engine — it is a cheap, dependency-free fallback
 * used when the AI provider is unavailable (dev without a key, outage, quota) so
 * the capture → review flow still works end to end. It only ever proposes a plain
 * task. It never produces anything that could post a money transaction.
 *
 * The real detector (detect-planner-intent) prefers the AI result and only calls
 * this when the model is unavailable or returns nothing usable.
 */

const MONEY_KEYWORDS = [
  // en
  "pay", "invoice", "bill", "renew", "subscription", "tax", "vat", "fee", "charge", "due", "€", "$", "eur", "usd",
  // ru
  "оплат", "оплач", "счёт", "счет", "налог", "подписк", "продлить", "продлен", "аренд", "платёж", "платеж", "списан", "списыва",
];

const SUBSCRIPTION_KEYWORDS = ["subscription", "подписк", "renew", "продл", "monthly", "ежемесяч", "adobe", "netflix", "spotify"];

const AMOUNT_RE = /(\d+(?:[.,]\d{1,2})?)\s*(€|\$|eur|usd|руб|₽)?/i;
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

function detectAmount(text: string): { amount: number | null; currency: string | null } {
  const m = text.match(AMOUNT_RE);
  if (!m) return { amount: null, currency: null };
  const amount = Number(m[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return { amount: null, currency: null };
  const raw = (m[2] ?? "").toLowerCase();
  const currency =
    raw === "€" || raw === "eur" ? "EUR"
    : raw === "$" || raw === "usd" ? "USD"
    : raw === "руб" || raw === "₽" ? "RUB"
    : null;
  return { amount, currency };
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0]?.trim() ?? text.trim();
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

export function normalizePlannerIntent(rawText: string): PlannerIntentDetectionResult {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const title = firstLine(text) || "Captured note";

  const looksFinancial = MONEY_KEYWORDS.some((k) => lower.includes(k));
  const looksSubscription = SUBSCRIPTION_KEYWORDS.some((k) => lower.includes(k));

  const isoDate = text.match(ISO_DATE_RE)?.[1] ?? null;
  // A capture may be twice as long as a task description; an over-long payload
  // would make the accept-time schema reject the draft.
  const description = text.length > title.length ? text.slice(0, PLANNER_DESCRIPTION_MAX_LENGTH) : "";

  // A payment the user must make is a task they do by hand (ADR 002, 0.1): the
  // retired financial types would produce a draft routeAccept refuses. It stays in
  // the "needs_review" band so the user always confirms the details.
  const missing: string[] = [];
  if (looksFinancial) {
    const { amount, currency } = detectAmount(text);
    if (!isoDate) missing.push("due_date");
    if (amount && !currency) missing.push("currency");
  }
  const confidence = !looksFinancial ? 0.62 : isoDate ? 0.7 : 0.55;

  return {
    detectedIntent: !looksFinancial ? "task" : looksSubscription ? "subscription_payment" : "payment",
    confidence,
    suggestions: [
      {
        suggestionType: "create_task",
        title,
        description: description || undefined,
        proposedPayload: {
          title,
          description,
          dueDate: isoDate ?? undefined,
          priority: "medium",
        },
        confidence,
      },
    ],
    missingInformation: missing.length ? missing : undefined,
  };
}
