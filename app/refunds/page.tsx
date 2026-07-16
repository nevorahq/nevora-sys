import type { Metadata } from "next";
import { LegalPageShell } from "@/modules/legal/components/legal-page-shell";
import { getLegalDocument, resolveLegalLocale } from "@/modules/legal/content/legal-content";
import { getPublicLocale } from "@/shared/i18n/get-dictionary";

export const metadata: Metadata = {
  title: "Refund Policy | Nevora Business OS",
  description:
    "Refund and cancellation policy for Nevora Business OS, operated by NEVORA SRL.",
};

interface RefundsPageProps {
  searchParams: Promise<{
    lang?: string | string[];
  }>;
}

export default async function RefundsPage({ searchParams }: RefundsPageProps) {
  const { lang } = await searchParams;
  const locale = lang !== undefined ? resolveLegalLocale(lang) : await getPublicLocale();

  return (
    <LegalPageShell
      document={getLegalDocument("refunds", locale)}
      locale={locale}
      page="refunds"
    />
  );
}
