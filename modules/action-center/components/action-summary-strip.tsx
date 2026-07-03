import { AlertTriangleIcon, CalendarClockIcon, CalendarDaysIcon, Clock3Icon, ListChecksIcon, RotateCcwIcon, type LucideIcon } from "lucide-react";
import type { ActionSummary } from "../types/action-center.types";

const CARDS: { key: keyof ActionSummary; label: string; icon: LucideIcon; tone: string }[] = [
  { key: "total", label: "Needs Attention", icon: ListChecksIcon, tone: "text-accent-blue" },
  { key: "dueToday", label: "Due Today", icon: CalendarClockIcon, tone: "text-accent-yellow" },
  { key: "upcoming", label: "Upcoming", icon: CalendarDaysIcon, tone: "text-accent-green" },
  { key: "overdue", label: "Overdue", icon: AlertTriangleIcon, tone: "text-danger" },
  { key: "snoozed", label: "Snoozed", icon: Clock3Icon, tone: "text-accent-lilac" },
  { key: "recentlyResolved", label: "Recently Resolved", icon: RotateCcwIcon, tone: "text-text-muted" },
];

/** Summary strip for independent attention lifecycle buckets. */
export function ActionSummaryStrip({ summary }: { summary: ActionSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {CARDS.map(({ key, label, icon: Icon, tone }) => (
        <div key={key} className="soft-card-sm flex items-center gap-3 p-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken ${tone}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold tabular-nums text-text-primary">{summary[key]}</p>
            <p className="truncate text-xs text-text-muted">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
