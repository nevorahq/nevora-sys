/**
 * Parse a QR code / barcode read off a receipt or an invoice into a structured
 * hint for extraction.
 *
 * A code almost never carries the line items. What it can carry is a small set
 * of values the issuer printed deliberately — a payment QR's amount and payee,
 * a fiscal receipt's verification link — and those are more trustworthy than a
 * model reading a crumpled photo. The photo still supplies the items; the hint
 * cross-checks the header (see `reconcileWithCode`).
 *
 * Pure and dependency-free so it runs on both sides and is cheap to test.
 */

export const RECEIPT_CODE_KINDS = [
  "md_fiscal",
  "epc_payment",
  "swiss_qr_bill",
  "product_code",
  "url",
  "text",
] as const;
export type ReceiptCodeKind = (typeof RECEIPT_CODE_KINDS)[number];

export interface ReceiptCodeHint {
  kind: ReceiptCodeKind;
  /** Symbology reported by the scanner (`qr_code`, `ean_13`, …), when known. */
  format: string | null;
  /** The decoded payload, trimmed and capped. */
  raw: string;
  payeeName: string | null;
  iban: string | null;
  amount: number | null;
  currency: string | null;
  /** YYYY-MM-DD. */
  date: string | null;
  reference: string | null;
  url: string | null;
}

/** Longest payload kept; a receipt code is short, anything longer is noise. */
export const RECEIPT_CODE_MAX_LENGTH = 2000;

export function parseReceiptCode(payload: string, format: string | null = null): ReceiptCodeHint | null {
  const raw = payload.replace(/\r\n?/g, "\n").trim().slice(0, RECEIPT_CODE_MAX_LENGTH);
  if (!raw) return null;
  const base = emptyHint(raw, format);

  const lines = raw.split("\n").map((line) => line.trim());
  if (lines[0] === "BCD") return parseEpc(base, lines);
  if (lines[0] === "SPC") return parseSwissQrBill(base, lines);

  if (/^\d{8}$|^\d{12,14}$/.test(raw)) return { ...base, kind: "product_code" };

  const url = toUrl(raw);
  if (url) {
    if (url.hostname === "sfs.md" || url.hostname.endsWith(".sfs.md")) return parseMdFiscal(base, url);
    return { ...base, kind: "url", url: url.toString() };
  }

  return base;
}

/**
 * EPC069-12 "SEPA credit transfer" QR (GiroCode). Line layout:
 * BCD, version, charset, SCT, BIC, name, IBAN, EUR<amount>, purpose,
 * structured reference, unstructured remittance, info.
 */
function parseEpc(base: ReceiptCodeHint, lines: string[]): ReceiptCodeHint {
  const match = (lines[7] ?? "").match(/^([A-Z]{3})(\d+(?:\.\d{1,2})?)$/);
  return {
    ...base,
    kind: "epc_payment",
    payeeName: blank(lines[5]),
    iban: normalizeIban(lines[6]),
    currency: match ? match[1] : null,
    amount: match ? positiveAmount(match[2]) : null,
    reference: blank(lines[9]) ?? blank(lines[10]),
  };
}

/**
 * Swiss QR-bill (SIX IG v2). Fixed positions: 3 IBAN, 5 creditor name,
 * 18 amount, 19 currency, 28 reference.
 */
function parseSwissQrBill(base: ReceiptCodeHint, lines: string[]): ReceiptCodeHint {
  const currency = blank(lines[19]);
  return {
    ...base,
    kind: "swiss_qr_bill",
    payeeName: blank(lines[5]),
    iban: normalizeIban(lines[3]),
    amount: positiveAmount(lines[18]),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    reference: blank(lines[28]),
  };
}

/**
 * Moldovan fiscal receipt: the QR is a link to the tax service's receipt
 * verifier. Its layout is not a published standard, so only clearly named query
 * parameters are read; the link itself goes to the model as a hint.
 */
function parseMdFiscal(base: ReceiptCodeHint, url: URL): ReceiptCodeHint {
  const param = (...names: string[]) => {
    for (const [key, value] of url.searchParams) {
      if (names.includes(key.toLowerCase()) && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    ...base,
    kind: "md_fiscal",
    url: url.toString(),
    amount: positiveAmount(param("sum", "suma", "amount", "total")),
    currency: "MDL",
    date: isoDate(param("date", "data")),
    reference: param("nr", "number", "receipt", "bon"),
  };
}

function emptyHint(raw: string, format: string | null): ReceiptCodeHint {
  return {
    kind: "text",
    format: format?.trim() || null,
    raw,
    payeeName: null,
    iban: null,
    amount: null,
    currency: null,
    date: null,
    reference: null,
    url: null,
  };
}

function toUrl(value: string): URL | null {
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeIban(value: string | undefined): string | null {
  const compact = value?.replace(/\s+/g, "").toUpperCase();
  return compact && /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(compact) ? compact : null;
}

function positiveAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const amount = Number(value.trim().replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = value.match(/^(\d{2})[./](\d{2})[./](\d{4})/);
  return dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : null;
}

export type CodeMismatchField = "amount" | "currency" | "date";

/** The header after the code has been applied on top of the model's reading. */
export interface CodeReconciliation {
  amount: number | null;
  currency: string | null;
  date: string | null;
  /** Fields where the model read something different from the code. */
  mismatches: CodeMismatchField[];
}

/**
 * Compare the model's header against the code. The code wins where it states a
 * value — the issuer printed it, the model read a photo — and every
 * disagreement is reported so the review form can point at it.
 */
export function reconcileWithCode(
  hint: ReceiptCodeHint | null,
  extracted: { amount: number | null; currency: string | null; date: string | null },
): CodeReconciliation {
  const mismatches: CodeMismatchField[] = [];
  if (!hint) return { ...extracted, mismatches };

  if (hint.amount != null && extracted.amount != null && Math.abs(hint.amount - extracted.amount) > 0.01) {
    mismatches.push("amount");
  }
  if (hint.currency && extracted.currency && hint.currency !== extracted.currency.toUpperCase()) {
    mismatches.push("currency");
  }
  if (hint.date && extracted.date && hint.date !== extracted.date) {
    mismatches.push("date");
  }

  return {
    amount: hint.amount ?? extracted.amount,
    currency: hint.currency ?? extracted.currency,
    date: hint.date ?? extracted.date,
    mismatches,
  };
}

/** The code, described for the extraction prompt. */
export function describeCodeForModel(hint: ReceiptCodeHint): string {
  const facts = [
    `kind: ${hint.kind}`,
    hint.payeeName && `payee: ${hint.payeeName}`,
    hint.amount != null && `amount: ${hint.amount}`,
    hint.currency && `currency: ${hint.currency}`,
    hint.date && `date: ${hint.date}`,
    hint.reference && `reference: ${hint.reference}`,
  ].filter(Boolean);
  return [
    "A code was scanned from this document. Its values were printed by the issuer;",
    "prefer them over what you read in the image when they disagree.",
    facts.join("; "),
    `payload: ${hint.raw.slice(0, 500)}`,
  ].join("\n");
}

/** Read a stored hint back (jsonb from the documents row); null when malformed. */
export function readStoredCodeHint(value: unknown): ReceiptCodeHint | null {
  if (!value || typeof value !== "object") return null;
  const stored = value as Record<string, unknown>;
  if (typeof stored.raw !== "string") return null;
  return parseReceiptCode(stored.raw, typeof stored.format === "string" ? stored.format : null);
}
