import { headers } from "next/headers";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { currencyForCountry } from "@/shared/config/currencies";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create organization — nevora-sys",
};

/**
 * Onboarding Page — первый экран после регистрации.
 *
 * Proxy гарантирует: сюда попадают только аутентифицированные
 * пользователи без организации. Дополнительная проверка auth
 * происходит в самом Server Action (requireUser).
 *
 * Server Component: данные для формы приходят через props (dict).
 * Никакого client-side fetching не нужно.
 *
 * Базовая валюта определяется по стране запроса (гео-заголовок прокси/CDN)
 * и подставляется в форму по умолчанию. Это лишь подсказка — пользователь
 * подтверждает или меняет значение перед созданием организации.
 */
export default async function OnboardingPage() {
  const { dict } = await getDictionary();

  const hdrs = await headers();
  // Заголовки страны от популярных edge/CDN-провайдеров. Нет заголовка
  // (локалка/иной хостинг) → currencyForCountry вернёт DEFAULT_BASE_CURRENCY.
  const country =
    hdrs.get("x-vercel-ip-country") ??
    hdrs.get("cf-ipcountry") ??
    hdrs.get("x-country") ??
    null;
  const detectedCurrency = currencyForCountry(country);

  return <OnboardingForm dict={dict} detectedCurrency={detectedCurrency} />;
}
