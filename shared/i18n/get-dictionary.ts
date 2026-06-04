import "server-only";
import { cookies } from "next/headers";
import { en } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isValidLocale, type Locale } from "./constants";

export type { Dictionary } from "./dictionaries/en";
export type { Locale };

const dictionaries = { en, ru } as const;

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value ?? "";
  return isValidLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getDictionary() {
  const locale = await getLocale();
  return { dict: dictionaries[locale], locale };
}
