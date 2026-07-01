import Link from "next/link";
import {
  CheckSquareIcon,
  FileTextIcon,
  WalletIcon,
  RepeatIcon,
  ArrowUpRightIcon,
  type LucideIcon,
} from "lucide-react";
import { getRelationsForEntity } from "../services/relation.service";
import { ENTITY_KIND_LABELS } from "../constants/relation.constants";
import { getRelationTypeLabel } from "../utils/relation-perspective-label";
import type {
  EntityKind,
  GroupedRelations,
  RelatedEntity,
} from "../types/relation.types";
import { RelationEmptyState } from "./relation-empty-state";
import { RelationSearchDialog } from "./relation-search-dialog";
import { RelationDeleteButton } from "./relation-delete-button";

interface UniversalRelationViewerProps {
  entityType: EntityKind;
  entityId: string;
  mode?: "full" | "compact";
  allowCreate?: boolean;
  allowDelete?: boolean;
  /** Путь для revalidate после мутаций (detail-страница). */
  revalidate?: string;
  title?: string;
}

const GROUP_ICON: Record<EntityKind, LucideIcon> = {
  task: CheckSquareIcon,
  document: FileTextIcon,
  transaction: WalletIcon,
  subscription: RepeatIcon,
};

const GROUP_ORDER: { key: keyof Omit<GroupedRelations, "total">; kind: EntityKind }[] = [
  { key: "documents", kind: "document" },
  { key: "transactions", kind: "transaction" },
  { key: "tasks", kind: "task" },
  { key: "subscriptions", kind: "subscription" },
];

/**
 * UniversalRelationViewer — reusable блок «Linked Entities».
 *
 * Async Server Component: тянет связи через relation.service (tenant-safe),
 * группирует и рендерит по видам. Мутации (add/delete) — через client-детей
 * (RelationSearchDialog / RelationDeleteButton), которые вызывают server actions.
 */
export async function UniversalRelationViewer({
  entityType,
  entityId,
  mode = "full",
  allowCreate = false,
  allowDelete = false,
  revalidate,
  title = "Linked Entities",
}: UniversalRelationViewerProps) {
  const res = await getRelationsForEntity({ entityType, entityId });
  const grouped = res.ok ? res.data : null;

  return (
    <section className="soft-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {allowCreate && (
          <RelationSearchDialog
            sourceEntityType={entityType}
            sourceEntityId={entityId}
            revalidate={revalidate}
          />
        )}
      </div>

      <div className={mode === "compact" ? "mt-3 space-y-4" : "mt-4 space-y-5"}>
        {!grouped || grouped.total === 0 ? (
          <RelationEmptyState />
        ) : (
          GROUP_ORDER.map(({ key, kind }) => {
            const items = grouped[key];
            if (items.length === 0) return null;
            return (
              <RelationGroup
                key={key}
                kind={kind}
                items={items}
                allowDelete={allowDelete}
                revalidate={revalidate}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function RelationGroup({
  kind,
  items,
  allowDelete,
  revalidate,
}: {
  kind: EntityKind;
  items: RelatedEntity[];
  allowDelete: boolean;
  revalidate?: string;
}) {
  const Icon = GROUP_ICON[kind];
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        <Icon size={13} /> {ENTITY_KIND_LABELS[kind]}
        <span className="text-text-muted/70">({items.length})</span>
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.relationId}>
            <RelationCard item={item} allowDelete={allowDelete} revalidate={revalidate} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RelationCard({
  item,
  allowDelete,
  revalidate,
}: {
  item: RelatedEntity;
  allowDelete: boolean;
  revalidate?: string;
}) {
  const { entity } = item;
  const amount =
    entity.amount !== null
      ? `${entity.currency ?? ""}${entity.amount}`.trim()
      : null;

  return (
    <div className="group flex items-center gap-3 rounded-(--neu-radius) bg-surface-sunken px-3 py-2.5">
      <Link href={entity.href} className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">
            {entity.title}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            <span className="rounded-full bg-surface px-1.5 py-0.5">
              {getRelationTypeLabel(item.relationType, entity.type)}
            </span>
            {entity.status && <span className="capitalize">{entity.status}</span>}
            {amount && <span>{amount}</span>}
            {entity.subtitle && <span className="truncate">{entity.subtitle}</span>}
            {item.metadata.source === "auto" && (
              <span className="text-accent-blue">auto</span>
            )}
          </span>
        </span>
        <ArrowUpRightIcon
          size={14}
          className="shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
        />
      </Link>
      {allowDelete && (
        <RelationDeleteButton relationId={item.relationId} revalidate={revalidate} />
      )}
    </div>
  );
}
