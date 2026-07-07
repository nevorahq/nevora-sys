import { FilePlusIcon, PencilIcon, Trash2Icon, ActivityIcon } from "lucide-react";
import { formatDate, formatTime } from "@/shared/utils/format-date";
import type { ActivityLogEntry } from "../queries/get-activity-log";
import type { ActivityType } from "../queries/activity-classification";
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
  /** Owner/admin see the Security Audit section; members do not. */
  canViewSecurity?: boolean;
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
 * Sections rendered top-to-bottom. `system` is intentionally absent — those
 * events are never surfaced (RLS also withholds them). `security` is gated on
 * canViewSecurity so a member never even sees an empty audit header.
 */
const SECTIONS: { type: ActivityType; title: string; adminOnly?: boolean }[] = [
  { type: "business", title: "Organization Activity" },
  { type: "security", title: "Security Audit", adminOnly: true },
  { type: "personal", title: "My Activity" },
];

function ActivityRow({
  entry,
  actor,
}: {
  entry: ActivityLogEntry;
  actor: string | undefined;
}) {
  const kind = activityKind(entry.eventName);
  const Icon = KIND_ICON[kind];
  return (
    <li className="flex items-start gap-3 rounded-(--neu-radius) bg-surface-sunken px-3.5 py-2.5">
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
}

/**
 * Activity Log — the visible event log, split by activity class per the target
 * isolation model (migration 087). RLS is the real guard: business is org-wide,
 * personal is the actor's own, security is owner/admin-only, system is hidden.
 * The grouping here only presents what the database already returned.
 */
export function ActivityLog({ entries, actors = {}, canViewSecurity = false }: ActivityLogProps) {
  const visible = entries.filter((e) => !isHiddenActivityEvent(e.eventName));
  const byType = new Map<ActivityType, ActivityLogEntry[]>();
  for (const e of visible) {
    const list = byType.get(e.activityType) ?? [];
    list.push(e);
    byType.set(e.activityType, list);
  }

  const renderedSections = SECTIONS.filter(
    (s) => !(s.adminOnly && !canViewSecurity),
  );
  const hasAny = renderedSections.some((s) => (byType.get(s.type)?.length ?? 0) > 0);

  return (
    <section className="space-y-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        Activity Log
        <span className="text-xs font-normal text-text-muted">({visible.length})</span>
      </h2>

      {!hasAny ? (
        <div className="soft-card p-6 text-center text-sm text-text-tertiary">
          No recent activity yet.
        </div>
      ) : (
        renderedSections.map((section) => {
          const rows = byType.get(section.type) ?? [];
          if (rows.length === 0) return null;
          return (
            <div key={section.type}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                {section.title}
                <span className="ml-1.5 font-normal normal-case">({rows.length})</span>
              </h3>
              <ol className="space-y-1.5">
                {rows.map((entry) => (
                  <ActivityRow
                    key={entry.id}
                    entry={entry}
                    actor={entry.actorId ? actors[entry.actorId] : undefined}
                  />
                ))}
              </ol>
            </div>
          );
        })
      )}
    </section>
  );
}
