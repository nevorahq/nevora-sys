export type Locale = "en" | "ru";

export const LOCALES: readonly Locale[] = ["en", "ru"] as const;
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "nevora_locale";

export function isValidLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
