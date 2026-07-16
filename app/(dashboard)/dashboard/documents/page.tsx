import { FileTextIcon, FileIcon, FilePenIcon, ArchiveIcon } from "lucide-react";
import Link from "next/link";
import { requireOrg } from "@/lib/auth/require-org";
import { getDocuments, getDocumentSummary } from "@/modules/documents";
import type { Document } from "@/modules/documents";
import { DocumentCreateButton } from "@/features/documents/components/document-create-button";
import { FirstActionCta } from "@/modules/onboarding/components/first-action-cta";
import { EmptyState } from "@/shared/ui/empty-state";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { ROUTES } from "@/shared/config/routes";
import { createClient } from "@/lib/supabase/server";

const FILTER_STATUSES = ["draft", "published", "archived"] as const;
type DocumentFilter = (typeof FILTER_STATUSES)[number] | "all";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const activeFilter: DocumentFilter = FILTER_STATUSES.includes(params.status as (typeof FILTER_STATUSES)[number])
    ? (params.status as (typeof FILTER_STATUSES)[number])
    : "all";
  const [{ org }, { dict }] = await Promise.all([requireOrg(), getDictionary()]);

  const [summary, recentDocs] = await Promise.all([
    getDocumentSummary(org.id),
    getDocuments(org.id, {
      limit: 30,
      ...(activeFilter === "all" ? {} : { status: activeFilter }),
    }),
  ]);
  const creatorIds = [...new Set(recentDocs.flatMap((document) => document.created_by ? [document.created_by] : []))];
  const supabase = await createClient();
  const { data: creators } = creatorIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", creatorIds)
    : { data: [] as Array<{ id: string; display_name: string | null }> };
  const t = dict.documents;
  const creatorNames = Object.fromEntries((creators ?? []).map((creator) => [creator.id, creator.display_name?.trim() || t.unknownUser]));

  const documentsByStatus = {
    draft: recentDocs.filter((d) => d.status === "draft"),
    published: recentDocs.filter((d) => d.status === "published"),
    archived: recentDocs.filter((d) => d.status === "archived"),
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{t.title}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {t.subtitle}
          </p>
        </div>
        <DocumentCreateButton label={t.newDocument} />
      </div>

      {/* Summary cards */}
      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          icon={<FileTextIcon size={16} />}
          label={t.summary.total}
          value={summary.total}
          href={ROUTES.documents}
          active={activeFilter === "all"}
        />
        <SummaryCard
          icon={<FilePenIcon size={16} />}
          label={t.summary.drafts}
          value={summary.drafts}
          href={`${ROUTES.documents}?status=draft`}
          active={activeFilter === "draft"}
        />
        <SummaryCard
          icon={<FileIcon size={16} />}
          label={t.summary.published}
          value={summary.published}
          href={`${ROUTES.documents}?status=published`}
          active={activeFilter === "published"}
        />
        <SummaryCard
          icon={<ArchiveIcon size={16} />}
          label={t.summary.archived}
          value={summary.archived}
          href={`${ROUTES.documents}?status=archived`}
          active={activeFilter === "archived"}
        />
      </section>

      {activeFilter === "all" ? (
        FILTER_STATUSES.map((status) => (
          documentsByStatus[status].length > 0 && (
            <DocumentSection key={status} status={status} docs={documentsByStatus[status]} creatorNames={creatorNames} t={t} />
          )
        ))
      ) : (
        <DocumentSection status={activeFilter} docs={recentDocs} creatorNames={creatorNames} t={t} />
      )}

      {/* Phase B / B6: an activation prompt only on a true absence of documents.
          A filter that matched nothing is not an onboarding moment. */}
      {recentDocs.length === 0 && (
        <div className="mt-10">
          {summary.total === 0 ? (
            <EmptyState
              icon={<FileTextIcon size={24} className="text-text-muted" strokeWidth={1.5} />}
              title={dict.firstRun.empty.documentsTitle}
              description={dict.firstRun.empty.documentsBody}
              actions={<FirstActionCta action="upload_document" label={dict.firstRun.uploadDocument} />}
            />
          ) : (
            <EmptyState
              icon={<FileTextIcon size={24} className="text-text-muted" strokeWidth={1.5} />}
              title={dict.common.noMatches}
            />
          )}
        </div>
      )}
    </>
  );
}

type DocsDict = Awaited<ReturnType<typeof getDictionary>>["dict"]["documents"];

function DocumentSection({ status, docs, creatorNames, t }: { status: (typeof FILTER_STATUSES)[number]; docs: Document[]; creatorNames: Record<string, string>; t: DocsDict }) {
  return <section className="mt-8">
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">{t.statuses[status]}</h2>
    <DocumentList docs={docs} creatorNames={creatorNames} t={t} />
  </section>;
}

function DocumentList({ docs, creatorNames, t }: { docs: Document[]; creatorNames: Record<string, string>; t: DocsDict }) {
  return (
    <div className="flex flex-col gap-2">
      {docs.map((doc) => (
        <Link key={doc.id} href={`${ROUTES.documents}/${doc.id}`} className="soft-card-sm flex items-center gap-4 p-3 transition-shadow hover:shadow-neu-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
          <FileTextIcon size={16} className="shrink-0 text-text-muted" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {doc.title}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {t.types[doc.doc_type]} ·{" "}
              {new Date(doc.updated_at).toLocaleDateString()}
            </p>
            <p className="mt-0.5 text-xs text-text-muted">
              {t.createdBy} {doc.created_by ? creatorNames[doc.created_by] ?? t.unknownUser : t.unknownUser}
            </p>
          </div>
          <StatusBadge status={doc.status} t={t} />
        </Link>
      ))}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  href,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`soft-card-sm block p-4 transition-all hover:shadow-neu-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${active ? "ring-2 ring-focus-ring" : ""}`}>
      <div className="flex items-center gap-2 text-text-muted">{icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold text-text-primary">{value}</p>
    </Link>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  published: "bg-accent-green-soft text-accent-green",
  archived:  "bg-accent-yellow-soft text-accent-yellow",
};

function StatusBadge({ status, t }: { status: string; t: DocsDict }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {t.statuses[status as keyof DocsDict["statuses"]] ?? status}
    </span>
  );
}
