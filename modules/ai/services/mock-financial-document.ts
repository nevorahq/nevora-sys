import "server-only";
import {
  ExtractedFinancialDocumentSchema,
  type ExtractedFinancialDocument,
} from "@/modules/documents/schemas/extracted-financial-document.schema";
import type { NormalizationInput, NormalizationResult } from "./normalize-financial-document";

/**
 * Pseudo-provider for local testing WITHOUT calling Anthropic (no API credits).
 *
 * Enabled only when DOCUMENT_EXTRACTION_MOCK is set to "1"/"true" in the server
 * env — it can never be triggered by client input and is never on by default.
 * It returns a schema-valid, high-confidence extraction so the full pipeline
 * (draft transaction → link → action item → ai_requests ledger) can be
 * exercised end-to-end.
 *
 * For the text path it makes a best-effort guess at total / currency / merchant
 * from the extracted text; for image/PDF-vision paths (no text) it uses
 * deterministic placeholders.
 */
export function isExtractionMockEnabled(): boolean {
  const flag = process.env.DOCUMENT_EXTRACTION_MOCK;
  return flag === "1" || flag === "true";
}

const CURRENCY_BY_SYMBOL: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP", "₴": "UAH", "₽": "RUB" };

function guessCurrency(text: string): string {
  const code = text.match(/\b(EUR|USD|MDL|GBP|RON|UAH|RUB|PLN)\b/i);
  if (code) return code[1].toUpperCase();
  for (const [symbol, iso] of Object.entries(CURRENCY_BY_SYMBOL)) {
    if (text.includes(symbol)) return iso;
  }
  return "EUR";
}

function guessTotal(text: string): number | null {
  // Prefer a number near a "total"/"итого"/"amount" keyword, else the largest
  // decimal in the document.
  const labelled = text.match(/(?:total|amount due|итого|сумма|amount)[^\d]{0,12}(\d[\d.,]*\d|\d)/i);
  const candidate = labelled?.[1] ?? null;
  const numbers = (text.match(/\d[\d.,]*\d|\d/g) ?? [])
    .map(normalizeNumber)
    .filter((n): n is number => n != null && n > 0);
  const labelledNum = candidate ? normalizeNumber(candidate) : null;
  if (labelledNum != null && labelledNum > 0) return labelledNum;
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

function normalizeNumber(raw: string): number | null {
  // Handle "1,234.56" and "1.234,56" and "15,00".
  let s = raw.trim();
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function guessMerchant(text: string): string | null {
  const isNoise = (l: string): boolean =>
    l.length < 2 ||
    /^page\s+\d+(\s+of\s+\d+)?$/i.test(l) || // "Page 1 of 1"
    /^[\d\s.,:/+-]+$/.test(l) ||             // pure numbers / dates / separators
    /^(invoice|receipt|tax|total|subtotal|date)\b/i.test(l); // header labels
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !isNoise(l));
  return line ? line.slice(0, 80) : null;
}

export function mockNormalizeFinancialDocument(input: NormalizationInput): NormalizationResult {
  console.warn("[normalizeFinancialDocument] DOCUMENT_EXTRACTION_MOCK is ON — returning a stubbed extraction (no Anthropic call).");

  const text = input.kind === "text" ? input.text : "";
  const total = guessTotal(text) ?? 15;
  const currency = guessCurrency(text);
  const merchant = guessMerchant(text) ?? "Mock Merchant";

  const candidate: ExtractedFinancialDocument = {
    documentType: "receipt",
    merchant: { name: merchant, taxId: null, address: null },
    transaction: {
      date: new Date().toISOString().slice(0, 10),
      currency,
      subtotal: Math.round(total * 0.8 * 100) / 100,
      tax: Math.round(total * 0.2 * 100) / 100,
      total,
      paymentMethod: "card",
      documentNumber: null,
    },
    items: [
      { name: "Mock line item", quantity: 1, unitPrice: total, totalPrice: total, taxRate: 0.2, category: "software" },
    ],
    confidence: { overall: 0.92, merchant: 0.9, date: 0.85, total: 0.95, items: 0.8 },
    suggestedActions: [{ type: "create_transaction", reason: "mock extraction" }],
  };

  // Validate through the same schema so the mock can never produce a shape the
  // real pipeline would reject.
  const parsed = ExtractedFinancialDocumentSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, errorCode: "schema_validation_failed", errorMessage: "Mock produced an invalid shape." };
  }
  return { ok: true, extracted: parsed.data, raw: { mock: true, candidate } };
}
