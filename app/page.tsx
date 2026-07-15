import type { Metadata } from "next";
import { getPublicLocale } from "@/shared/i18n/get-dictionary";
import { LandingPage, landingMetadata } from "@/modules/landing";

/**
 * Публичный лендинг Nevora Business OS (корень `/`).
 *
 * Server Component без бизнес-логики: читает публичную локаль из cookie (en/ru/ro)
 * и передаёт её LandingPage. Локали `/en` `/ru` `/ro` — отдельные canonical-входы
 * с собственной локализованной metadata.
 */
export async function generateMetadata(): Promise<Metadata> {
  return landingMetadata(await getPublicLocale());
}

export default async function HomePage() {
  const locale = await getPublicLocale();
  return <LandingPage locale={locale} />;
}
