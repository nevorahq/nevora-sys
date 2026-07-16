import "server-only";
import { cookies } from "next/headers";
import { en } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";
import { ro } from "./dictionaries/ro";
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

const dictionaries = { en, ru, ro } as const;

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
 * Локаль интерфейса приложения (en/ru/ro). Совпадает с публичной локалью —
 * у `ro` теперь есть полный словарь приложения (`toAppLocale` = тождество).
 * Сигнатура сохранена, чтобы не трогать существующие вызовы в dashboard/auth.
 */
export async function getLocale(): Promise<Locale> {
  return toAppLocale(await getPublicLocale());
}

export async function getDictionary() {
  const locale = await getLocale();
  return { dict: dictionaries[locale], locale };
}
