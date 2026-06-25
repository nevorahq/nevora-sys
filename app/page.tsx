import { getLocale } from "@/shared/i18n/get-dictionary";
import { getLandingContent } from "@/modules/landing/constants/landing-content";
import {
  LandingHeader,
  HeroSection,
  ValueSection,
  AboutSection,
  PhilosophySection,
  PlansSection,
  TrialDetailsSection,
  ContactSection,
  LandingFooter,
} from "@/modules/landing";

/**
 * Публичный лендинг Nevora Business OS.
 *
 * Server Component без бизнес-логики: читает локаль из cookie и раздаёт
 * секциям слайсы локализованного контента. Переключение языка работает
 * через общий LanguageSwitcher (cookie + router.refresh → ре-рендер).
 */
export default async function HomePage() {
  const locale = await getLocale();
  const content = getLandingContent(locale);

  return (
    <div className="flex flex-1 flex-col">
      <LandingHeader nav={content.nav} header={content.header} locale={locale} />
      <main className="flex-1">
        <HeroSection content={content.hero} />
        <ValueSection content={content.value} />
        <AboutSection content={content.about} />
        <PhilosophySection content={content.philosophy} />
        <PlansSection content={content.plans} />
        <TrialDetailsSection content={content.trialDetails} />
        <ContactSection content={content.contact} />
      </main>
      <LandingFooter nav={content.nav} footer={content.footer} />
    </div>
  );
}
