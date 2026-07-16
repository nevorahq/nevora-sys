"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isValidPublicLocale } from "./constants";

export async function setLocaleAction(locale: string) {
  // Принимаем публичные локали (en/ru/ro): экшен обслуживает и переключатель
  // приложения (en/ru), и языковое меню лендинга (добавляет ro). Для ro
  // интерфейс приложения падает в en (см. toAppLocale), но лендинг/legal/metadata
  // остаются румынскими.
  if (!isValidPublicLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
