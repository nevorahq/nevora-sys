import { getLandingContent, type LandingLocale } from "../constants/landing-content";
import { AboutSection } from "./about-section";
import { ContactSection } from "./contact-section";
import { HeroSection } from "./hero-section";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { PhilosophySection } from "./philosophy-section";
import { PlansSection } from "./plans-section";
import { TrialDetailsSection } from "./trial-details-section";
import { ValueSection } from "./value-section";

interface LandingPageProps {
  locale: LandingLocale;
}

export function LandingPage({ locale }: LandingPageProps) {
  const content = getLandingContent(locale);

  return (
    <div lang={locale} className="flex flex-1 flex-col">
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
