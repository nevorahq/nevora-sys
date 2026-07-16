"use client";

import { useEffect } from "react";
import type { PublicLocale } from "@/shared/i18n/constants";

const LOCALE_COOKIE = "nevora_locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Синхронизирует локаль лендинга с документом и cookie публичной локали.
 *
 * Зачем: `<html lang>` и app-cookie задаются на сервере по cookie. При ПРЯМОМ
 * заходе на `/en` `/ru` `/ro` (ссылка из поиска, шаринг) cookie может отличаться
 * от пути. Языковое меню при выборе ставит cookie, но для холодного прямого
 * визита этот компонент:
 *  1) выставляет `document.documentElement.lang` = локали маршрута;
 *  2) синхронизирует cookie `nevora_locale`, чтобы последующие переходы на
 *     login/register/legal сохраняли язык (для ro интерфейс приложения падает
 *     в en — см. toAppLocale).
 * Контент и так обёрнут в `<div lang>`, а hreflang/og:locale отдаются в metadata.
 */
export function HtmlLangSync({ locale }: { locale: PublicLocale }) {
  useEffect(() => {
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }

    const current = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${LOCALE_COOKIE}=`))
      ?.split("=")[1];

    if (current !== locale) {
      document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    }
  }, [locale]);

  return null;
}
