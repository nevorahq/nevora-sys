import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { NewDocumentForm } from "@/modules/documents/components/new-document-form";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";

export default async function NewDocumentPage() {
  const { dict } = await getDictionary();
  const t = dict.documents;
  return <>
    <div className="mb-6"><Link href={ROUTES.documents} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> {t.title}</Link><h1 className="mt-4 text-2xl font-semibold text-text-primary">{t.newPage.title}</h1><p className="mt-1 text-sm text-text-muted">{t.newPage.subtitle}</p></div>
    <NewDocumentForm t={t} />
  </>;
}
