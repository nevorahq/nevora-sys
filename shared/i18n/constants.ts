export type Locale = "en" | "ru";

export const LOCALES: readonly Locale[] = ["en", "ru"] as const;
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "nevora_locale";

export function isValidLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Публичная локаль — единая ось языка для лендинга, legal-страниц, `<html lang>`
 * и metadata. Шире, чем app-словарь: поддерживает румынский.
 *
 * Зачем отдельный тип, а не просто расширить `Locale`: dashboard/auth-словари
 * (`dictionaries/*.ts`) существуют только для en/ru (~1600 строк перевода на
 * язык), и полный RO-словарь приложения — вне текущего этапа. Поэтому `ro`
 * живёт как публичная локаль (лендинг + legal + metadata полностью на румынском),
 * а интерфейс приложения для неё осознанно падает в английский — см.
 * `toAppLocale`. Это задокументированное ограничение, а не имитация поддержки.
 */
export type PublicLocale = "en" | "ru" | "ro";

export const PUBLIC_LOCALES: readonly PublicLocale[] = ["en", "ru", "ro"] as const;
export const DEFAULT_PUBLIC_LOCALE: PublicLocale = DEFAULT_LOCALE;

/** Полные названия языков для переключателей (не коды). */
export const PUBLIC_LOCALE_NAMES: Record<PublicLocale, string> = {
  en: "English",
  ru: "Русский",
  ro: "Română",
};

export function isValidPublicLocale(value: string): value is PublicLocale {
  return (PUBLIC_LOCALES as readonly string[]).includes(value);
}

/**
 * Сводит публичную локаль к локали app-словаря. `ro` → `en` (fallback), потому
 * что румынского словаря приложения пока нет. Единственная точка этого решения.
 */
export function toAppLocale(locale: PublicLocale): Locale {
  return locale === "ro" ? "en" : locale;
}
