import { AlertTriangleIcon, CalendarClockIcon, ClipboardCheckIcon, SparklesIcon, type LucideIcon } from "lucide-react";
import type { ActionSummary } from "../types/action-center.types";

const CARDS: { key: keyof ActionSummary; label: string; icon: LucideIcon; tone: string }[] = [
  { key: "critical", label: "Critical", icon: AlertTriangleIcon, tone: "text-accent-pink" },
  { key: "dueToday", label: "Due Today", icon: CalendarClockIcon, tone: "text-accent-yellow" },
  { key: "waitingApproval", label: "Waiting Approval", icon: ClipboardCheckIcon, tone: "text-accent-blue" },
  { key: "aiSuggestions", label: "AI Suggestions", icon: SparklesIcon, tone: "text-accent-lilac" },
];

/** Summary Strip — 4 ключевых счётчика над фидом. */
export function ActionSummaryStrip({ summary }: { summary: ActionSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
