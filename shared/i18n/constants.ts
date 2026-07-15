export type Locale = "en" | "ru" | "ro";

export const LOCALES: readonly Locale[] = ["en", "ru", "ro"] as const;
export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "nevora_locale";

export function isValidLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Публичная локаль — единая ось языка для лендинга, legal-страниц, `<html lang>`
 * и metadata. Теперь совпадает с локалью приложения: у `ro` есть полный словарь
 * интерфейса (`dictionaries/ro.ts`), поэтому фоллбэка `ro → en` больше нет.
 * Тип-алиас сохранён, чтобы импорты лендинга/legal не менялись.
 */
export type PublicLocale = Locale;

export const PUBLIC_LOCALES: readonly PublicLocale[] = LOCALES;
export const DEFAULT_PUBLIC_LOCALE: PublicLocale = DEFAULT_LOCALE;

/** Полные названия языков для переключателей (не коды). */
export const PUBLIC_LOCALE_NAMES: Record<PublicLocale, string> = {
  en: "English",
  ru: "Русский",
  ro: "Română",
};

export function isValidPublicLocale(value: string): value is PublicLocale {
  return isValidLocale(value);
}

/**
 * Сводит публичную локаль к локали app-словаря. Раньше `ro → en`; теперь `ro`
 * имеет собственный словарь приложения, поэтому это тождество. Функция и её
 * единственная точка вызова (`getLocale`) сохранены, чтобы не трогать вызовы.
 */
export function toAppLocale(locale: PublicLocale): Locale {
  return locale;
}
