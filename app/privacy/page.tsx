import type { Metadata } from "next";
import { LegalPageShell } from "@/modules/legal/components/legal-page-shell";
import { getLegalDocument, resolveLegalLocale } from "@/modules/legal/content/legal-content";
import { getPublicLocale } from "@/shared/i18n/get-dictionary";

export const metadata: Metadata = {
  title: "Privacy Policy | Nevora Business OS",
  description: "Privacy Policy for Nevora Business OS, operated by NEVORA SRL.",
};

interface PrivacyPageProps {
  searchParams: Promise<{
    lang?: string | string[];
  }>;
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const { lang } = await searchParams;
  // ?lang выигрывает (ссылки из футера его несут); при прямом заходе без него —
  // берём публичную локаль из cookie, чтобы язык не терялся.
  const locale = lang !== undefined ? resolveLegalLocale(lang) : await getPublicLocale();

  return (
    <LegalPageShell
      document={getLegalDocument("privacy", locale)}
      locale={locale}
      page="privacy"
    />
  );
}
