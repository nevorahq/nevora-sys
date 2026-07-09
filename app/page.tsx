import { getLocale } from "@/shared/i18n/get-dictionary";
import { LandingPage } from "@/modules/landing";

/**
 * Публичный лендинг Nevora Business OS.
 *
 * Server Component без бизнес-логики: читает app locale из cookie и передаёт
 * LandingPage публичную локаль. RO доступен отдельной страницей /ro, чтобы
 * не расширять dashboard-словари раньше времени.
 */
export default async function HomePage() {
  const locale = await getLocale();

  return <LandingPage locale={locale} />;
}
