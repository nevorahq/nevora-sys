const RATE_DECIMAL_PLACES = 10;
export const UNUSUAL_RATE_DEVIATION = 0.1;

export function normalizeLocalizedRate(value: string): string {
  return value.trim().replace(",", ".");
}

/**
 * The dashboard speaks in the familiar convention `1 quote = X org base`.
 * The existing DB model intentionally remains `1 org base = X quote`.
 */
export function toStoredOrganizationRate(basePerQuote: string | number): string {
  const value = typeof basePerQuote === "string"
    ? Number(normalizeLocalizedRate(basePerQuote))
    : basePerQuote;
  if (!Number.isFinite(value) || value <= 0) throw new Error("invalid_exchange_rate");
  return (1 / value).toFixed(RATE_DECIMAL_PLACES);
}

export function toDisplayOrganizationRate(storedBaseToQuote: string | number): number {
  const value = Number(storedBaseToQuote);
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;
  return 1 / value;
}

export function relativeRateDeviation(value: number, reference: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(reference) || value <= 0 || reference <= 0) {
    return null;
  }
  return Math.abs(value / reference - 1);
}

export function isUnusualRate(
  value: number,
  reference: number,
  threshold = UNUSUAL_RATE_DEVIATION,
): boolean {
  const deviation = relativeRateDeviation(value, reference);
  return deviation != null && deviation > threshold;
}
