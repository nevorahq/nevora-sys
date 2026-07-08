"use client";

import { ClockIcon, LinkIcon, RotateCcwIcon, SparklesIcon, Trash2Icon, UserIcon } from "lucide-react";
import { Checkbox } from "@/shared/ui/checkbox";
import { ActionPriorityBadge } from "./action-priority-badge";
import { RESTORE_LABEL, TYPE_LABELS, SOURCE_LABELS, DELETED_MARKER_LABEL } from "../constants/action-center.constants";
import type { ActionFeedItem } from "../types/action-center.types";
import { REVIEW_STATE_LABELS } from "@/modules/review/constants/review.constants";

interface ActionCardProps {
  item: ActionFeedItem;
  onOpen: (id: string) => void;
  muted?: boolean;
  selected?: boolean;
  onSelectedChange?: (id: string, selected: boolean) => void;
  /** When set, renders a "Restore" control (used in the Recently Resolved list). */
  onRestore?: (id: string) => void;
  restoring?: boolean;
}

function formatDue(due: string): { label: string; overdue: boolean } {
  const d = new Date(due);
  const overdue = d.getTime() < Date.now();
  return { label: d.toLocaleDateString(), overdue };
}

/** Карточка action item. Клик открывает Detail Drawer. */
export function ActionCard({ item, onOpen, muted, selected, onSelectedChange, onRestore, restoring }: ActionCardProps) {
  const due = item.due_at ? formatDue(item.due_at) : null;
  const selectable = Boolean(onSelectedChange);
  // Source entity was deleted (stamped by recordTaskDeletionInActionCenter).
  const isDeleted = item.metadata?.task_deleted === true || item.metadata?.source === "task_delete";

  return (
    <article
      className={`flex w-full gap-3 rounded-(--neu-radius) bg-surface-sunken p-3.5 text-left transition-colors hover:bg-surface ${muted ? "opacity-60" : ""} ${selected ? "ring-2 ring-accent-green/45" : ""}`}
    >
      {selectable && (
        <div className="pt-0.5">
          <Checkbox
            aria-label={`Select action: ${item.title}`}
            checked={selected ?? false}
            onChange={(event) => onSelectedChange?.(item.id, event.currentTarget.checked)}
          />
        </div>
      )}

      <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium text-text-primary">{item.title}</p>
          {isDeleted ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
              <Trash2Icon size={11} /> {DELETED_MARKER_LABEL}
            </span>
          ) : (
            <ActionPriorityBadge priority={item.priority} />
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className="rounded-full bg-surface px-1.5 py-0.5">{SOURCE_LABELS[item.source_type]}</span>
          <span>{TYPE_LABELS[item.type]}</span>
          {item.review_state && (
            <span className="rounded-full bg-info-soft px-1.5 py-0.5 text-info">
              {REVIEW_STATE_LABELS[item.review_state]}
            </span>
          )}
          {due && (
            <span className={`inline-flex items-center gap-1 ${due.overdue ? "text-accent-pink" : ""}`}>
              <ClockIcon size={12} /> {due.label}
            </span>
          )}
          {item.related_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <LinkIcon size={12} /> {item.related_count}
            </span>
          )}
          {item.assignee_name && (
            <span className="inline-flex items-center gap-1">
              <UserIcon size={12} /> {item.assignee_name}
            </span>
          )}
          {item.ai_generated && (
            <span className="inline-flex items-center gap-1 text-accent-lilac">
              <SparklesIcon size={12} />
              {typeof item.ai_confidence === "number" ? `${Math.round(item.ai_confidence * 100)}%` : "AI"}
            </span>
          )}
        </div>
      </button>

      {onRestore && (
        <button
          type="button"
          onClick={() => onRestore(item.id)}
          disabled={restoring}
          title={isDeleted ? `${RESTORE_LABEL} (${DELETED_MARKER_LABEL})` : RESTORE_LABEL}
          className="inline-flex shrink-0 items-center gap-1 self-start rounded-(--neu-radius-pill) bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          <RotateCcwIcon size={13} /> {RESTORE_LABEL}
        </button>
      )}
    </article>
  );
}
