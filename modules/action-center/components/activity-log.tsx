import { FilePlusIcon, PencilIcon, Trash2Icon, ActivityIcon } from "lucide-react";
import { formatDate, formatTime } from "@/shared/utils/format-date";
import type { ActivityLogEntry } from "../queries/get-activity-log";
import {
  activityKind,
  activityLabel,
  isHiddenActivityEvent,
  type ActivityKind,
} from "../queries/format-activity-event";

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  /** actorId → display name, for "by <name>". */
  actors?: Record<string, string>;
}

const KIND_ICON: Record<ActivityKind, React.ElementType> = {
  create: FilePlusIcon,
  update: PencilIcon,
  delete: Trash2Icon,
  other: ActivityIcon,
};

const KIND_COLOR: Record<ActivityKind, string> = {
  create: "text-accent-green",
  update: "text-accent-lilac",
  delete: "text-danger",
  other: "text-text-muted",
};

/**
 * Activity Log — the visible event log (every create/update/delete across all
 * modules), newest first. Read-only projection of domain_events. Internal
 * lifecycle noise is filtered to match the "Действия" counter.
 */
export function ActivityLog({ entries, actors = {} }: ActivityLogProps) {
  const visible = entries.filter((e) => !isHiddenActivityEvent(e.eventName));

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
        Activity Log
        <span className="text-xs font-normal text-text-muted">({visible.length})</span>
      </h2>

      {visible.length === 0 ? (
        <div className="soft-card p-6 text-center text-sm text-text-tertiary">
          No recent activity yet.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {visible.map((entry) => {
            const kind = activityKind(entry.eventName);
            const Icon = KIND_ICON[kind];
            const actor = entry.actorId ? actors[entry.actorId] : undefined;
            return (
              <li
                key={entry.id}
                className="flex items-start gap-3 rounded-(--neu-radius) bg-surface-sunken px-3.5 py-2.5"
              >
                <Icon size={15} className={`mt-0.5 shrink-0 ${KIND_COLOR[kind]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">
                    <span className="font-medium">{activityLabel(entry.eventName)}</span>
                    {entry.title && <span className="text-text-secondary"> · {entry.title}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
                    {actor && <span> · {actor}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
