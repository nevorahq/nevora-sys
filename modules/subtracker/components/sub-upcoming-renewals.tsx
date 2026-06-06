import { AlertTriangleIcon, ClockIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/format-money";
import type { UpcomingRenewal } from "../types/subtracker.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

/**
 * Upcoming Renewals — список подписок со списанием в ближайшие 7 дней.
 *
 * Цветовая индикация по urgency:
 * - 5+ дней → accent-yellow (предупреждение)
 * - 3-4 дня → accent-yellow (внимание)
 * - 1-2 дня → accent-pink (срочно)
 * - 0 дней (сегодня) → danger (критично)
 */
interface SubUpcomingRenewalsProps {
  renewals: UpcomingRenewal[];
  dict: Dictionary;
}

export function SubUpcomingRenewals({ renewals, dict }: SubUpcomingRenewalsProps) {
  const t = dict.subscriptions.upcoming;

  if (renewals.length === 0) {
    return (
      <div className="soft-inset rounded-(--neu-radius-md) px-4 py-6 text-center">
        <p className="text-sm text-text-muted">{t.noUpcoming}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {renewals.map((renewal) => {
        const urgency = getUrgency(renewal.daysUntil);
        const label = getLabel(renewal.daysUntil, t);

        return (
          <div
            key={renewal.id}
            className="soft-card-sm flex items-center gap-3 p-4"
          >
            {/* Urgency icon */}
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md)",
                urgency.bg,
              )}
            >
              {renewal.daysUntil <= 1 ? (
                <AlertTriangleIcon size={18} className={urgency.text} strokeWidth={2} />
              ) : (
                <ClockIcon size={18} className={urgency.text} strokeWidth={2} />
              )}
            </div>

            {/* Name + badge */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {renewal.name}
              </p>
              <p className={cn("text-xs font-medium", urgency.text)}>
                {label}
              </p>
            </div>

            {/* Amount */}
            <p className="text-sm font-semibold text-text-primary tabular-nums shrink-0">
              {formatMoney(Number(renewal.amount))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function getUrgency(daysUntil: number) {
  if (daysUntil <= 0) return { bg: "bg-danger-soft", text: "text-danger" };
  if (daysUntil <= 2) return { bg: "bg-accent-pink-soft", text: "text-accent-pink" };
  return { bg: "bg-accent-yellow-soft", text: "text-accent-yellow" };
}

function getLabel(
  daysUntil: number,
  t: { in5days: string; in3days: string; tomorrow: string; today: string },
): string {
  if (daysUntil <= 0) return t.today;
  if (daysUntil === 1) return t.tomorrow;
  if (daysUntil <= 3) return t.in3days;
  return t.in5days;
}
