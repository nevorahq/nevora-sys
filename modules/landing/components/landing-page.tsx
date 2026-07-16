import type { PublicLocale } from "@/shared/i18n/constants";
import { getLandingContent } from "../constants/landing-content";
import { AreasSection } from "./areas-section";
import { ControlSection } from "./control-section";
import { HeroSection } from "./hero-section";
import { HowItWorksSection } from "./how-it-works-section";
import { HtmlLangSync } from "./html-lang-sync";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { PlansSection } from "./plans-section";
import { StorySection } from "./story-section";

interface LandingPageProps {
  locale: PublicLocale;
}

export function LandingPage({ locale }: LandingPageProps) {
  const content = getLandingContent(locale);

  return (
    <div lang={locale} className="flex flex-1 flex-col">
      <HtmlLangSync locale={locale} />
      <LandingHeader nav={content.nav} header={content.header} locale={locale} />
      <main className="flex-1">
        <HeroSection content={content.hero} />
        <HowItWorksSection content={content.how} />
        <AreasSection content={content.areas} />
        <ControlSection content={content.control} />
        <PlansSection content={content.plans} locale={locale} />
        <StorySection story={content.story} contact={content.contact} />
      </main>
      <LandingFooter nav={content.nav} footer={content.footer} locale={locale} />
    </div>
  );
}
