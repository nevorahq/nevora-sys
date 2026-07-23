/**
 * Локализуемый presentation-слой каталога тарифов.
 *
 * Архитектурное разделение: СТАБИЛЬНЫЕ данные тарифа (ключи, цены, числовые
 * лимиты, entitlement-mapping) живут в `plan-catalog.ts` — их читают backend-гейты
 * и тесты. ЛОКАЛИЗУЕМЫЙ copy (названия, описания, подписи фич/лимитов, CTA,
 * chrome страницы /pricing) живёт здесь. `public-plan-view.ts` собирает их вместе.
 *
 * КОНТРАКТ: английские значения обязаны совпадать с тем, что раньше было зашито
 * в `plan-catalog.ts` (`commercialFeatureLabels`, `commercialUsageLabels`, имена
 * и описания планов, "Unlimited"). Тест `plan-catalog.test.ts` пинит английский
 * рендер (`label: "Documents processed"`, `value: "Unlimited"`), поэтому en —
 * источник истины и не должен «дрейфовать» при переводе ru/ro.
 */

import type { PublicLocale } from "@/shared/i18n/constants";
import type {
  CommercialFeatureKey,
  CommercialPlanKey,
  CommercialUsageMetricKey,
} from "./plan-catalog.schema";

export interface PlanCopy {
  name: string;
  description: string;
  upgradeValue: string;
}

/** Названия/описания планов. Имена планов одинаковы во всех локалях (бренд-нейтральны). */
export const planCopyByLocale: Record<PublicLocale, Record<CommercialPlanKey, PlanCopy>> = {
  en: {
    free: {
      name: "Free",
      description: "Validate the workspace with the core workflow and honest limits.",
      upgradeValue: "Keep working after the trial with higher monthly limits.",
    },
    starter: {
      name: "Starter",
      description: "For solo operators and very small teams.",
      upgradeValue: "More room for documents, AI suggestions, team seats, and automations.",
    },
    pro: {
      name: "Pro",
      description: "For small teams that need stronger workflow capacity.",
      upgradeValue: "Unlock team-scale document processing, AI review, and automation volume.",
    },
    business: {
      name: "Business",
      description: "For teams that need higher limits and operational control.",
      upgradeValue: "Move critical operations to unlimited usage with priority support.",
    },
  },
  ru: {
    free: {
      name: "Free",
      description: "Проверьте рабочее пространство на основном процессе с честными лимитами.",
      upgradeValue: "Продолжайте работу после пробного периода с более высокими месячными лимитами.",
    },
    starter: {
      name: "Starter",
      description: "Для одиночных пользователей и совсем небольших команд.",
      upgradeValue: "Больше документов, рекомендаций ИИ, мест в команде и автоматизаций.",
    },
    pro: {
      name: "Pro",
      description: "Для небольших команд, которым нужен более сильный рабочий процесс.",
      upgradeValue: "Командные объёмы обработки документов, проверки ИИ и автоматизаций.",
    },
    business: {
      name: "Business",
      description: "Для команд, которым нужны высокие лимиты и операционный контроль.",
      upgradeValue: "Переведите ключевые операции на неограниченное использование с приоритетной поддержкой.",
    },
  },
  ro: {
    free: {
      name: "Free",
      description: "Validează spațiul de lucru pe fluxul de bază, cu limite oneste.",
      upgradeValue: "Continuă după perioada de probă cu limite lunare mai mari.",
    },
    starter: {
      name: "Starter",
      description: "Pentru utilizatori individuali și echipe foarte mici.",
      upgradeValue: "Mai mult loc pentru documente, sugestii IA, locuri în echipă și automatizări.",
    },
    pro: {
      name: "Pro",
      description: "Pentru echipe mici care au nevoie de un flux de lucru mai puternic.",
      upgradeValue: "Volum de echipă pentru procesarea documentelor, verificarea IA și automatizări.",
    },
    business: {
      name: "Business",
      description: "Pentru echipe care au nevoie de limite mai mari și control operațional.",
      upgradeValue: "Mută operațiunile critice pe utilizare nelimitată, cu suport prioritar.",
    },
  },
};

/** Подписи лимитов. EN обязан совпадать с прежними `commercialUsageLabels`. */
export const usageLabelByLocale: Record<PublicLocale, Record<CommercialUsageMetricKey, string>> = {
  en: {
    documents_processed_monthly: "Documents processed",
    ai_suggestions_monthly: "AI suggestions",
    team_members_count: "Team members",
    storage_used_bytes: "Storage",
    automation_runs_monthly: "Automation runs",
  },
  ru: {
    documents_processed_monthly: "Обработка документов",
    ai_suggestions_monthly: "Рекомендации ИИ",
    team_members_count: "Участники команды",
    storage_used_bytes: "Хранилище",
    automation_runs_monthly: "Запуски автоматизаций",
  },
  ro: {
    documents_processed_monthly: "Documente procesate",
    ai_suggestions_monthly: "Sugestii IA",
    team_members_count: "Membri echipă",
    storage_used_bytes: "Stocare",
    automation_runs_monthly: "Rulări automatizări",
  },
};

/** Подписи фич. EN обязан совпадать с прежними `commercialFeatureLabels`. */
export const featureLabelByLocale: Record<PublicLocale, Record<CommercialFeatureKey, string>> = {
  en: {
    "documents.upload": "Upload documents",
    "documents.process": "Process documents",
    "ai.suggestions.generate": "Generate AI suggestions",
    "team.members.invite": "Invite team members",
    "storage.files.upload": "Upload files",
    "automations.run": "Run automations",
  },
  ru: {
    "documents.upload": "Загрузка документов",
    "documents.process": "Обработка документов",
    "ai.suggestions.generate": "Генерация рекомендаций ИИ",
    "team.members.invite": "Приглашение участников",
    "storage.files.upload": "Загрузка файлов",
    "automations.run": "Запуск автоматизаций",
  },
  ro: {
    "documents.upload": "Încărcare documente",
    "documents.process": "Procesare documente",
    "ai.suggestions.generate": "Generare sugestii IA",
    "team.members.invite": "Invitare membri",
    "storage.files.upload": "Încărcare fișiere",
    "automations.run": "Rulare automatizări",
  },
};

/** Значение неограниченного лимита. EN обязан быть "Unlimited" (пинится тестом). */
export const unlimitedLabelByLocale: Record<PublicLocale, string> = {
  en: "Unlimited",
  ru: "Без ограничений",
  ro: "Nelimitat",
};

/** Подпись бесплатной цены (amount === null). */
export const freePriceLabelByLocale: Record<PublicLocale, string> = {
  en: "Free",
  ru: "Бесплатно",
  ro: "Gratuit",
};

/** Интервал оплаты (после «/»). */
export const intervalLabelByLocale: Record<PublicLocale, { month: string; year: string }> = {
  en: { month: "month", year: "year" },
  ru: { month: "мес.", year: "год" },
  ro: { month: "lună", year: "an" },
};

export interface CtaCopy {
  /** Free-план: реальное действие — открыть регистрацию (пробный период открыт). */
  startTrial: string;
  /** Платный план в закрытой бете: покупка недоступна, действия нет. */
  availableAfterBeta: string;
  choosePlan: string;
  contactUs: string;
  contactSales: string;
  startFree: string;
}

export const ctaByLocale: Record<PublicLocale, CtaCopy> = {
  en: {
    startTrial: "Start a 14-day trial",
    availableAfterBeta: "Available after beta",
    choosePlan: "Choose plan",
    contactUs: "Contact us",
    contactSales: "Contact sales",
    startFree: "Start free",
  },
  ru: {
    startTrial: "Начать 14-дневный пробный период",
    availableAfterBeta: "Будет доступно после беты",
    choosePlan: "Выбрать тариф",
    contactUs: "Связаться с нами",
    contactSales: "Связаться с отделом продаж",
    startFree: "Начать бесплатно",
  },
  ro: {
    startTrial: "Începe perioada de probă de 14 zile",
    availableAfterBeta: "Disponibil după beta",
    choosePlan: "Alege planul",
    contactUs: "Contactează-ne",
    contactSales: "Contactează vânzările",
    startFree: "Începe gratuit",
  },
};

/** Chrome страницы /pricing. */
export interface PricingPageCopy {
  eyebrow: string;
  title: string;
  intro: string;
  privateBetaNote: string;
  requestAccess: string;
  limitsHeading: string;
  featuresSuffix: string;
  privateBetaCardNote: string;
  /** Бейдж рекомендованного плана (был захардкожен "Recommended" в карточке). */
  recommendedBadge: string;
}

export const pricingPageCopyByLocale: Record<PublicLocale, PricingPageCopy> = {
  en: {
    eyebrow: "Pricing",
    title: "Nevora Business OS plans",
    intro: "Plans, limits and features are rendered from the same billing catalog the backend uses.",
    privateBetaNote:
      "Nevora is in private beta. Paid checkout is not available yet — start the free trial, and paid plans open once billing is enabled.",
    requestAccess: "Start a 14-day trial",
    limitsHeading: "Limits",
    featuresSuffix: "features",
    privateBetaCardNote: "Private beta. No paid checkout yet.",
    recommendedBadge: "Recommended",
  },
  ru: {
    eyebrow: "Тарифы",
    title: "Тарифы Nevora Business OS",
    intro: "Тарифы, лимиты и возможности берутся из того же каталога, что использует бэкенд.",
    privateBetaNote:
      "Nevora в закрытой бете. Платная оплата пока недоступна — начните бесплатный пробный период, платные тарифы откроются после включения оплаты.",
    requestAccess: "Начать 14-дневный пробный период",
    limitsHeading: "Лимиты",
    featuresSuffix: "— возможности",
    privateBetaCardNote: "Закрытая бета. Платная оплата пока недоступна.",
    recommendedBadge: "Рекомендуем",
  },
  ro: {
    eyebrow: "Prețuri",
    title: "Planurile Nevora Business OS",
    intro: "Planurile, limitele și funcțiile sunt afișate din același catalog pe care îl folosește backendul.",
    privateBetaNote:
      "Nevora este în versiune beta privată. Plata nu este încă disponibilă — începe proba gratuită, iar planurile plătite se deschid după activarea facturării.",
    requestAccess: "Începe perioada de probă de 14 zile",
    limitsHeading: "Limite",
    featuresSuffix: "— funcții",
    privateBetaCardNote: "Versiune beta privată. Fără plată încă.",
    recommendedBadge: "Recomandat",
  },
};

/** BCP-47 тег для Intl.NumberFormat при форматировании цен. */
export const intlLocaleTag: Record<PublicLocale, string> = {
  en: "en",
  ru: "ru-RU",
  ro: "ro-RO",
};

/** Локализованное значение лимита: число (в локали) / объём / «без ограничений». */
export function formatLimitValue(
  metric: CommercialUsageMetricKey,
  value: number | null,
  locale: PublicLocale,
): string {
  if (value === null) return unlimitedLabelByLocale[locale];
  if (metric === "storage_used_bytes") {
    if (value >= 1024 * 1024 * 1024) return `${Math.round(value / 1024 / 1024 / 1024)} GB`;
    return `${Math.round(value / 1024 / 1024)} MB`;
  }
  return new Intl.NumberFormat(intlLocaleTag[locale]).format(value);
}
