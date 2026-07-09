import type { Metadata } from "next";
import { LegalPageShell } from "@/modules/legal/components/legal-page-shell";
import { getLegalDocument, resolveLegalLocale } from "@/modules/legal/content/legal-content";

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
  const locale = resolveLegalLocale(lang);

  return (
    <LegalPageShell
      document={getLegalDocument("refunds", locale)}
      locale={locale}
      page="refunds"
    />
  );
}
