import { RepeatIcon, CalendarIcon, TrendingUpIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/format-money";
import type { SubSummary } from "../types/subtracker.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

interface SubSummaryCardsProps {
  summary: SubSummary;
  dict: Dictionary;
}

export function SubSummaryCards({ summary, dict }: SubSummaryCardsProps) {
  const t = dict.subscriptions.summary;

  const cards = [
    {
      label: t.active,
      value: String(summary.activeCount),
      icon: RepeatIcon,
      accentBg: "bg-accent-lilac-soft",
      accentText: "text-accent-lilac",
    },
    {
      label: t.monthlyCost,
      value: formatMoney(summary.monthlyCost),
      icon: CalendarIcon,
      accentBg: "bg-accent-yellow-soft",
      accentText: "text-accent-yellow",
    },
    {
      label: t.yearlyCost,
      value: formatMoney(summary.yearlyCost),
      icon: TrendingUpIcon,
      accentBg: "bg-accent-pink-soft",
      accentText: "text-accent-pink",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="soft-card-sm p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                {card.label}
              </p>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-(--neu-radius-md)",
                  card.accentBg,
                )}
              >
                <Icon size={18} className={card.accentText} strokeWidth={2} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-semibold text-text-primary tabular-nums">
              {card.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
