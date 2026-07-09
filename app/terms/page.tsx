import type { Metadata } from "next";
import { LegalPageShell } from "@/modules/legal/components/legal-page-shell";
import { getLegalDocument, resolveLegalLocale } from "@/modules/legal/content/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service | Nevora Business OS",
  description: "Terms of Service for Nevora Business OS, operated by NEVORA SRL.",
};

interface TermsPageProps {
  searchParams: Promise<{
    lang?: string | string[];
  }>;
}

export default async function TermsPage({ searchParams }: TermsPageProps) {
  const { lang } = await searchParams;
  const locale = resolveLegalLocale(lang);

  return (
    <LegalPageShell
      document={getLegalDocument("terms", locale)}
      locale={locale}
      page="terms"
    />
  );
}
