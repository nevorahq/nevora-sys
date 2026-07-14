import Link from "next/link";
import { ChevronRightIcon, ClockIcon } from "lucide-react";
import { ActionPriorityBadge } from "./action-priority-badge";
import { SOURCE_LABELS, TYPE_LABELS } from "../constants/action-center.constants";
import { getActionItemDestination, type ActionItemDestinationTarget } from "../services/get-action-item-destination";
import type { AttentionItem } from "../queries/get-attention-view";
import type { ActionItemStatus } from "../types/action-item.types";

/** Human-readable status, kept local and translatable-in-style with the module. */
const STATUS_LABELS: Record<ActionItemStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  snoozed: "Snoozed",
  resolved: "Resolved",
  dismissed: "Dismissed",
  cancelled: "Cancelled",
  failed: "Failed",
};

/** The single navigational label per owning surface. Deliberately read-only verbs. */
const DESTINATION_LABELS: Record<ActionItemDestinationTarget, string> = {
  inbox_review: "Open review",
  tasks: "Open in Tasks",
  money: "Open in Money",
  subscriptions: "Open in Subscriptions",
  documents: "Open in Documents",
  none: "Source unavailable",
};

function formatDue(due: string): { label: string; overdue: boolean } {
  const date = new Date(due);
  return { label: date.toLocaleDateString(), overdue: date.getTime() < Date.now() };
}

/**
 * Read-only Attention list. Each row states what needs attention (title, source,
 * status, due, priority) and offers exactly one operation: open the owning module,
 * where the entity is actually managed. No checkboxes, no bulk toolbar, no
 * resolve/dismiss/snooze/assign/execute — the Action Center no longer mutates
 * business state.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-(--neu-radius) bg-surface-sunken px-4 py-10 text-center text-sm text-text-muted">
        Nothing in this view.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <AttentionRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const destination = getActionItemDestination(item);
  const due = item.due_at ? formatDue(item.due_at) : null;

  const meta = (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
      <span className="rounded-full bg-surface px-1.5 py-0.5">{SOURCE_LABELS[item.source_type]}</span>
      <span>{TYPE_LABELS[item.type]}</span>
      <span className="text-text-tertiary">{STATUS_LABELS[item.status]}</span>
      {due && (
        <span className={`inline-flex items-center gap-1 ${due.overdue ? "text-accent-pink" : ""}`}>
          <ClockIcon size={12} /> {due.label}
        </span>
      )}
    </div>
  );

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
        {meta}
      </div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        <ActionPriorityBadge priority={item.priority} />
        {destination.href && <ChevronRightIcon size={16} className="text-text-tertiary" />}
      </div>
    </>
  );

  // A resolvable destination makes the whole row a link to the owning module.
  // An unknown/deleted source renders as plain, non-clickable text — never a
  // broken link.
  if (destination.href) {
    return (
      <li>
        <Link
          href={destination.href}
          aria-label={`${item.title} — ${DESTINATION_LABELS[destination.target]}`}
          className="flex gap-3 rounded-(--neu-radius) bg-surface-sunken p-3 transition-colors hover:bg-surface"
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li className="flex gap-3 rounded-(--neu-radius) bg-surface-sunken p-3 opacity-80">
      {body}
    </li>
  );
}
