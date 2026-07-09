import type { Metadata } from "next";
import { LegalPageShell } from "@/modules/legal/components/legal-page-shell";
import { getLegalDocument, resolveLegalLocale } from "@/modules/legal/content/legal-content";

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
  const locale = resolveLegalLocale(lang);

  return (
    <LegalPageShell
      document={getLegalDocument("privacy", locale)}
      locale={locale}
      page="privacy"
    />
  );
}
