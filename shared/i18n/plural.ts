import type { Locale } from "./constants";

/** The plural categories we keep in the dictionaries (superset of en + ru). */
export interface PluralForms {
  one: string;
  few: string;
  many: string;
  other: string;
}

/**
 * Pick the grammatically correct plural form for `count` in the given locale.
 *
 * Uses `Intl.PluralRules` so Russian's one/few/many split is handled correctly
 * (1 транзакция · 2 транзакции · 5 транзакций) without hand-rolled modulo math.
 * English collapses to one/other.
 */
export function pluralForm(locale: Locale, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(locale).select(count);
  return forms[category as keyof PluralForms] ?? forms.other;
}
