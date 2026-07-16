import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, FileTextIcon, LinkIcon } from "lucide-react";
import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { getDocumentById } from "@/modules/documents";
import { DocumentPreviewCard, type DocumentAttachmentPreview } from "@/modules/documents/components/document-preview-card";
import { isFinancialDocumentType } from "@/modules/documents/constants/document.constants";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { getDocumentExtractionState } from "@/modules/documents/queries/get-document-extraction";
import { DocumentExtractionReview } from "@/modules/documents/components/document-extraction-review";
import { DocumentObligationSuggestion } from "@/modules/documents/components/document-obligation-suggestion";
import { ExtractedFinancialDocumentSchema } from "@/modules/documents/schemas/extracted-financial-document.schema";
import { classifyFinancialDocumentType } from "@/modules/documents/services/classify-financial-document";
import { DEFAULT_REMINDER_OFFSET_DAYS } from "@/modules/tasks/constants/task.constants";
import { UniversalRelationViewer } from "@/modules/relations";
import { ROUTES } from "@/shared/config/routes";
import { DocumentDetailActions } from "@/modules/documents/components/document-detail-actions";

export default async function DocumentPreviewPage({ params }: PageProps<"/dashboard/documents/[documentId]">) {
  const { documentId } = await params;
  const [ctx, { dict }] = await Promise.all([requireOrg(), getDictionary()]);
  const { org } = ctx;
  const t = dict.documents;
  const document = await getDocumentById(org.id, documentId);
  if (!document) notFound();

  const supabase = await createClient();
  const attachments: DocumentAttachmentPreview[] = await Promise.all(document.attachments.map(async (attachment) => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(attachment.file_path, 60 * 60);
    return { ...attachment, signedUrl: data?.signedUrl ?? null };
  }));

  const isFinancial = isFinancialDocumentType(document.doc_type);
  const extractionState = isFinancial ? await getDocumentExtractionState(org.id, document.id) : null;

  // Financial-obligation suggestion (spec §15): classify the normalized extraction
  // and, if it describes a future payment, offer to create a Financial Context Task.
  let obligationSuggestion: ReturnType<typeof classifyFinancialDocumentType> = null;
  if (extractionState?.extraction?.normalized_json) {
    const parsed = ExtractedFinancialDocumentSchema.safeParse(extractionState.extraction.normalized_json);
    if (parsed.success) obligationSuggestion = classifyFinancialDocumentType(parsed.data);
  }
  const existingFinancialTask = obligationSuggestion
    ? (
        await supabase
          .from("todos")
          .select("id")
          .eq("organization_id", org.id)
          .eq("financial_source_type", "document")
          .eq("financial_source_id", document.id)
          .is("deleted_at", null)
          .maybeSingle()
      ).data
    : null;

  return <>
    <div className="mb-6">
      <Link href={ROUTES.documents} className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary"><ArrowLeftIcon size={16} /> {t.title}</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-text-primary">{document.title}</h1><p className="mt-1 text-sm text-text-muted">{t.types[document.doc_type]} · {t.detail.updated} {new Date(document.updated_at).toLocaleDateString()}</p></div>
        <div className="flex items-center gap-3"><span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-text-secondary">{t.statuses[document.status]}</span><DocumentDetailActions document={document} canUpdate={canDo(ctx, "data.write")} canDelete={canDo(ctx, "data.delete")} t={t} /></div>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <main className="space-y-6">
        {isFinancial && extractionState && (
          <DocumentExtractionReview documentId={document.id} state={extractionState} canConfirm={canDo(ctx, "data.write")} t={t} />
        )}
        {obligationSuggestion && (
          <DocumentObligationSuggestion
            documentId={document.id}
            suggestion={{
              contextType: obligationSuggestion.contextType,
              providerName: obligationSuggestion.providerName,
              amount: obligationSuggestion.amount,
              currency: obligationSuggestion.currency,
              financialDueDate: obligationSuggestion.financialDueDate,
              reminderOffsetDays: DEFAULT_REMINDER_OFFSET_DAYS,
            }}
            existingTaskId={(existingFinancialTask?.id as string | undefined) ?? null}
            canCreate={canDo(ctx, "todos.write")}
            t={t.obligation}
            ft={dict.financialTask}
          />
        )}
        <section className="soft-card p-5 sm:p-6"><div className="mb-3 flex items-center gap-2 text-text-secondary"><FileTextIcon size={18} /><h2 className="font-semibold">{t.detail.notesField}</h2></div><p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">{document.content || t.detail.noNotes}</p></section>
        <section><h2 className="mb-3 text-base font-semibold text-text-primary">{t.form.attachments}</h2>{attachments.length ? <div className="grid gap-4 lg:grid-cols-2">{attachments.map((attachment) => <DocumentPreviewCard key={attachment.id} attachment={attachment} />)}</div> : <div className="soft-card-sm p-5 text-sm text-text-muted">{t.detail.noFiles}</div>}</section>
        <UniversalRelationViewer entityType="document" entityId={document.id} allowCreate={canDo(ctx, "entity_link.create")} allowDelete={canDo(ctx, "entity_link.delete")} revalidate={`${ROUTES.documents}/${document.id}`} />
      </main>
      <aside className="space-y-4">
        {document.entity_type && <section className="soft-card-sm p-4"><p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t.detail.linkedTo}</p><p className="mt-2 text-sm font-medium capitalize text-text-primary">{document.entity_type}</p></section>}
        {document.links.length > 0 && <section className="soft-card-sm p-4"><h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary"><LinkIcon size={16} /> {t.detail.links}</h2><div className="mt-3 space-y-2">{document.links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-text-secondary underline hover:text-text-primary">{link.title}</a>)}</div></section>}
      </aside>
    </div>
  </>;
}
