import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { NewDocumentForm } from "@/modules/documents/components/new-document-form";
import { ROUTES } from "@/shared/config/routes";

export default function NewDocumentPage() {
  return <>
    <div className="mb-6"><Link href={ROUTES.documents} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> Documents</Link><h1 className="mt-4 text-2xl font-semibold text-text-primary">New document</h1><p className="mt-1 text-sm text-text-muted">Keep your files and context together in one place.</p></div>
    <NewDocumentForm />
  </>;
}
