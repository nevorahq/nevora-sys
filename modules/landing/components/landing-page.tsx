import type { PublicLocale } from "@/shared/i18n/constants";
import { getDictionaryFor } from "@/shared/i18n/get-dictionary";
import { getLandingContent } from "../constants/landing-content";
import { AiLimitsSection } from "./ai-limits-section";
import { AreasSection } from "./areas-section";
import { AttentionSection } from "./attention-section";
import { ControlSection } from "./control-section";
import { DocJourneySection } from "./doc-journey-section";
import { FaqSection } from "./faq-section";
import { HeroSection } from "./hero-section";
import { HowItWorksSection } from "./how-it-works-section";
import { HtmlLangSync } from "./html-lang-sync";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";
import { PlansSection } from "./plans-section";
import { ProductPreviewSection } from "./product-preview-section";
import { ProofSection } from "./proof-section";
import { StatesSection } from "./states-section";
import { StorySection } from "./story-section";

interface LandingPageProps {
  locale: PublicLocale;
}

export function LandingPage({ locale }: LandingPageProps) {
  const content = getLandingContent(locale);
  // Подписи шести состояний берём из словаря приложения — те же слова, что видит
  // пользователь на экранах Money. Берём по ЯВНОЙ локали лендинга, а не из cookie,
  // чтобы на canonical-входах `/ru` `/ro` подписи не разъехались с остальным текстом.
  const dict = getDictionaryFor(locale);

  return (
    <div lang={locale} className="flex flex-1 flex-col">
      <HtmlLangSync locale={locale} />
      <LandingHeader nav={content.nav} header={content.header} locale={locale} />
      <main className="flex-1">
        <HeroSection content={content.hero} />
        <ProductPreviewSection
          content={content.preview}
          navLabels={{
            home: dict.nav.home,
            work: dict.nav.tasks,
            money: dict.nav.money,
            documents: dict.nav.documents,
            inbox: dict.nav.inbox,
            settings: dict.nav.settings,
          }}
          stateLabels={dict.money.states}
        />
        <HowItWorksSection content={content.how} />
        <AreasSection content={content.areas} />
        <AttentionSection content={content.attention} />
        <DocJourneySection content={content.docJourney} />
        <StatesSection content={content.states} labels={dict.money.states} />
        <AiLimitsSection content={content.aiLimits} />
        <ControlSection content={content.control} />
        <ProofSection content={content.proof} />
        <PlansSection content={content.plans} locale={locale} />
        <FaqSection content={content.faq} />
        <StorySection story={content.story} contact={content.contact} />
      </main>
      <LandingFooter nav={content.nav} footer={content.footer} locale={locale} />
    </div>
  );
}
