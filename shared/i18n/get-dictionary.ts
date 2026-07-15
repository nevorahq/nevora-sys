import "server-only";
import { cookies } from "next/headers";
import { en } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";
import {
  DEFAULT_PUBLIC_LOCALE,
  LOCALE_COOKIE,
  isValidPublicLocale,
  toAppLocale,
  type Locale,
  type PublicLocale,
} from "./constants";

export type { Dictionary } from "./dictionaries/en";
export type { Locale, PublicLocale };

const dictionaries = { en, ru } as const;

/**
 * Публичная локаль из cookie (en/ru/ro). Единая ось языка для лендинга,
 * legal-страниц, `<html lang>` и metadata.
 */
export async function getPublicLocale(): Promise<PublicLocale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value ?? "";
  return isValidPublicLocale(value) ? value : DEFAULT_PUBLIC_LOCALE;
}

/**
 * Локаль интерфейса приложения (en/ru). Сводит публичную локаль к словарю app:
 * `ro` → `en`. Сигнатура намеренно неизменна — все существующие вызовы
 * `getLocale()` в dashboard/auth продолжают получать только en/ru.
 */
export async function getLocale(): Promise<Locale> {
  return toAppLocale(await getPublicLocale());
}

export async function getDictionary() {
  const locale = await getLocale();
  return { dict: dictionaries[locale], locale };
}
