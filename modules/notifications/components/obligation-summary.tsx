import { AlertTriangleIcon, CalendarClockIcon, CalendarDaysIcon, ListChecksIcon, type LucideIcon } from "lucide-react";
import type { NotificationCounters } from "../types";

const ITEMS: { key: keyof Pick<NotificationCounters, "attention" | "upcoming" | "dueToday" | "overdue">; label: string; icon: LucideIcon; tone: string }[] = [
  { key: "attention", label: "Needs attention", icon: ListChecksIcon, tone: "text-accent-blue" },
  { key: "dueToday", label: "Due today", icon: CalendarClockIcon, tone: "text-accent-yellow" },
  { key: "upcoming", label: "Upcoming 7 days", icon: CalendarDaysIcon, tone: "text-accent-green" },
  { key: "overdue", label: "Overdue", icon: AlertTriangleIcon, tone: "text-danger" },
];

export function ObligationSummary({ counters }: { counters: NotificationCounters }) {
  return (
    <section className="mt-6" aria-labelledby="obligation-summary-title">
      <h2 id="obligation-summary-title" className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-secondary">Operational attention</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ITEMS.map(({ key, label, icon: Icon, tone }) => (
          <div key={key} className="soft-card-sm flex items-center gap-3 p-4">
            <span className={`flex h-9 w-9 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken ${tone}`}><Icon size={18} /></span>
            <div><p className="text-xl font-semibold tabular-nums text-text-primary">{counters[key]}</p><p className="text-xs text-text-muted">{label}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}
