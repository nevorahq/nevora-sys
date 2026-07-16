import Link from "next/link";
import {
  CheckSquareIcon,
  FileTextIcon,
  WalletIcon,
  RepeatIcon,
  type LucideIcon,
} from "lucide-react";
import { getRelationsForEntity } from "../services/relation.service";
import { toRelationCounts } from "../utils/group-relations-by-type";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import type { EntityKind, RelationCounts } from "../types/relation.types";
import { RelationSearchDialog } from "./relation-search-dialog";

interface LinkedEntitiesWidgetProps {
  entityType: EntityKind;
  entityId: string;
  /** Куда ведёт "View all" (например, на detail-страницу с полным viewer). */
  viewAllHref?: string;
  allowCreate?: boolean;
  revalidate?: string;
}

const COUNT_META: { key: keyof Omit<RelationCounts, "total">; kind: EntityKind; icon: LucideIcon }[] = [
  { key: "documents", kind: "document", icon: FileTextIcon },
  { key: "transactions", kind: "transaction", icon: WalletIcon },
  { key: "tasks", kind: "task", icon: CheckSquareIcon },
  { key: "subscriptions", kind: "subscription", icon: RepeatIcon },
];

/**
 * LinkedEntitiesWidget — компактный блок счётчиков связей.
 *
 * Пригоден для cards, detail drawers, table rows, dashboard widgets.
 * Async Server Component: считает связи tenant-safe и показывает counts +
 * View all + Add link.
 */
export async function LinkedEntitiesWidget({
  entityType,
  entityId,
  viewAllHref,
  allowCreate = false,
  revalidate,
}: LinkedEntitiesWidgetProps) {
  const [res, { dict }] = await Promise.all([
    getRelationsForEntity({ entityType, entityId }),
    getDictionary(),
  ]);
  const r = dict.relations;
  const counts = res.ok
    ? toRelationCounts(res.data)
    : { tasks: 0, documents: 0, transactions: 0, subscriptions: 0, total: 0 };

  return (
    <div className="soft-card-sm space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">{r.title}</p>
        <span className="text-xs text-text-muted">{counts.total}</span>
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {COUNT_META.map(({ key, kind, icon: Icon }) => (
          <li
            key={key}
            className="flex items-center gap-2 rounded-(--neu-radius) bg-surface-sunken px-2.5 py-2"
          >
            <Icon size={14} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
              {r.kindsPlural[kind]}
            </span>
            <span className="text-sm font-semibold text-text-primary">{counts[key]}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 pt-1">
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-sm font-medium text-text-secondary underline hover:text-text-primary"
          >
            {r.viewAll}
          </Link>
        ) : (
          <span />
        )}
        {allowCreate && (
          <RelationSearchDialog
            sourceEntityType={entityType}
            sourceEntityId={entityId}
            revalidate={revalidate}
            triggerVariant="ghost"
            t={r}
          />
        )}
      </div>
    </div>
  );
}
