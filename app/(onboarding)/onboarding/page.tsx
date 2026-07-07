import { headers } from "next/headers";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { currencyForCountry } from "@/shared/config/currencies";
import { requireUser } from "@/lib/auth/require-user";
import { PendingInvitesCard, getPendingInvites } from "@/modules/members";
import { getTrialEligibilityForCurrentUser, isTrialAlreadyUsed } from "@/modules/billing";
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
  const [{ dict }] = await Promise.all([getDictionary(), requireUser()]);
  const [pendingInvites, trialEligibility] = await Promise.all([
    getPendingInvites(),
    // Trial Identity Hardening (089): UX-подсказка. Не security boundary —
    // повторный trial блокируется в БД независимо от того, что видит UI.
    getTrialEligibilityForCurrentUser(),
  ]);

  const hdrs = await headers();
  // Заголовки страны от популярных edge/CDN-провайдеров. Нет заголовка
  // (локалка/иной хостинг) → currencyForCountry вернёт DEFAULT_BASE_CURRENCY.
  const country =
    hdrs.get("x-vercel-ip-country") ??
    hdrs.get("cf-ipcountry") ??
    hdrs.get("x-country") ??
    null;
  const detectedCurrency = currencyForCountry(country);

  return (
    <div className="w-full max-w-md space-y-4">
      {pendingInvites.length > 0 && (
        <PendingInvitesCard invites={pendingInvites} redirectOnAccept />
      )}
      {isTrialAlreadyUsed(trialEligibility) && (
        <div className="rounded-xl border border-border-soft bg-surface-muted p-4 text-sm">
          <p className="font-semibold text-text-primary">Your free trial has already been used.</p>
          <p className="mt-1 text-text-muted">
            You can still create this organization, but it will start without a trial —
            choose the Start, Pro or Business plan on the Billing page to activate it.
          </p>
        </div>
      )}
      <OnboardingForm dict={dict} detectedCurrency={detectedCurrency} />
    </div>
  );
}
