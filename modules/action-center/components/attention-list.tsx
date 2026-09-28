import Link from "next/link";
import { ChevronRightIcon, ClockIcon } from "lucide-react";
import { PriorityBadge } from "@/shared/ui/priority-badge";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { Locale } from "@/shared/i18n/constants";
import { localizeActionItemTitle } from "../utils/action-item-title";
import { getActionItemDestination } from "../services/get-action-item-destination";
import type { AttentionItem } from "../queries/get-attention-view";

type ActionCenterCopy = Dictionary["actionCenter"];

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ru: "ru-RU", ro: "ro-RO" };

function formatDue(due: string, locale: Locale): { label: string; overdue: boolean } {
  const date = new Date(due);
  return { label: date.toLocaleDateString(INTL_LOCALE[locale]), overdue: date.getTime() < Date.now() };
}

/**
 * Read-only Attention list. Each row states what needs attention (title, source,
 * status, due, priority) and offers exactly one operation: open the owning module,
 * where the entity is actually managed. No checkboxes, no bulk toolbar, no
 * resolve/dismiss/snooze/assign/execute — the Action Center no longer mutates
 * business state.
 */
export function AttentionList({
  items,
  t,
  locale,
}: {
  items: AttentionItem[];
  t: ActionCenterCopy;
  locale: Locale;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-(--neu-radius) bg-surface-sunken px-4 py-10 text-center text-sm text-text-muted">
        {t.empty}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <AttentionRow key={item.id} item={item} t={t} locale={locale} />
      ))}
    </ul>
  );
}

function AttentionRow({ item, t, locale }: { item: AttentionItem; t: ActionCenterCopy; locale: Locale }) {
  const destination = getActionItemDestination(item);
  const due = item.due_at ? formatDue(item.due_at, locale) : null;
  const title = localizeActionItemTitle(item.title, t.titles);

  const meta = (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
      <span className="rounded-full bg-surface px-1.5 py-0.5">{t.sources[item.source_type]}</span>
      <span>{t.types[item.type]}</span>
      <span className="text-text-tertiary">{t.statuses[item.status]}</span>
      {due && (
        <span className={`inline-flex items-center gap-1 ${due.overdue ? "font-medium text-danger" : ""}`}>
          <ClockIcon size={12} /> {due.label}
        </span>
      )}
    </div>
  );

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        {meta}
      </div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        <PriorityBadge priority={item.priority} label={t.priorities[item.priority]} />
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
          aria-label={`${title} — ${t.destinations[destination.target]}`}
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
