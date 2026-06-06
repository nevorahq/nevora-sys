import {
  CheckCircle2Icon,
  CircleDotIcon,
  AlertTriangleIcon,
  CalendarClockIcon,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { TaskSummary } from "../queries/get-task-summary";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * TaskSummaryCards — summary по задачам для dashboard overview.
 *
 * Server Component — нет интерактивности, 0 KB JS.
 *
 * 4 карточки:
 * - Active (незавершённые) → lilac
 * - Due Today (дедлайн сегодня) → yellow
 * - Overdue (просроченные) → pink/danger
 * - Completed (завершённые) → green
 */
interface TaskSummaryCardsProps {
  summary: TaskSummary;
  dict: Dictionary;
}

export function TaskSummaryCards({ summary, dict }: TaskSummaryCardsProps) {
  const cards = [
    {
      label: dict.dashboard.taskSummary.active,
      value: summary.active,
      icon: CircleDotIcon,
      accentBg: "bg-accent-lilac-soft",
      accentText: "text-accent-lilac",
    },
    {
      label: dict.dashboard.taskSummary.dueToday,
      value: summary.dueToday,
      icon: CalendarClockIcon,
      accentBg: "bg-accent-yellow-soft",
      accentText: "text-accent-yellow",
    },
    {
      label: dict.dashboard.taskSummary.overdue,
      value: summary.overdue,
      icon: AlertTriangleIcon,
      accentBg: "bg-accent-pink-soft",
      accentText: "text-accent-pink",
    },
    {
      label: dict.dashboard.taskSummary.completed,
      value: summary.completed,
      icon: CheckCircle2Icon,
      accentBg: "bg-accent-green-soft",
      accentText: "text-accent-green",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="soft-card-sm p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {card.label}
              </p>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-(--neu-radius-md)",
                  card.accentBg,
                )}
              >
                <Icon size={16} className={card.accentText} strokeWidth={2} />
              </div>
            </div>
            <p className="mt-2 text-xl font-semibold text-text-primary tabular-nums">
              {card.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
