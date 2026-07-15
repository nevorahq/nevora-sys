import type { Metadata } from "next";
import type { PublicLocale } from "@/shared/i18n/constants";
import { getLandingContent } from "./constants/landing-content";

const OG_LOCALE: Record<PublicLocale, string> = {
  en: "en_US",
  ru: "ru_RU",
  ro: "ro_RO",
};

const CANONICAL: Record<PublicLocale, string> = {
  en: "/en",
  ru: "/ru",
  ro: "/ro",
};

/**
 * Локализованная metadata лендинга (title / description / Open Graph / hreflang).
 * `title.absolute` обходит root-шаблон "%s — Nevora Business OS": `meta.title`
 * уже содержит бренд, поэтому дублировать его не нужно.
 */
export function landingMetadata(locale: PublicLocale): Metadata {
  const { meta } = getLandingContent(locale);

  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: {
      canonical: CANONICAL[locale],
      languages: { en: "/en", ru: "/ru", ro: "/ro" },
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      locale: OG_LOCALE[locale],
      type: "website",
    },
    twitter: {
      card: "summary",
      title: meta.title,
      description: meta.description,
    },
  };
}
