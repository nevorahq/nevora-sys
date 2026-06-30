import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { MonthRange } from "../lib/month-range";

/**
 * History navigator for the Money page. Server component (0 KB JS): month
 * selection lives in the `?month=YYYY-MM` URL param, so each step is a plain
 * <Link> navigation that re-renders the month-scoped data on the server.
 *
 * Forward navigation past the current month is disabled (no future browsing).
 */
export function MonthNavigator({ range, dict }: { range: MonthRange; dict: Dictionary }) {
  const t = dict.money.history;
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex items-center gap-1 rounded-(--neu-radius-md) border border-border bg-surface p-1">
        <Link
          href={`${ROUTES.money}?month=${range.prevMonth}`}
          aria-label={t.prevMonth}
          className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-sm) text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
        >
          <ChevronLeftIcon size={18} />
        </Link>

        <span className="min-w-36 px-2 text-center text-sm font-semibold text-text-primary tabular-nums">
          {range.label}
        </span>

        {range.nextMonth ? (
          <Link
            href={`${ROUTES.money}?month=${range.nextMonth}`}
            aria-label={t.nextMonth}
            className="inline-flex h-8 w-8 items-center justify-center rounded-(--neu-radius-sm) text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
          >
            <ChevronRightIcon size={18} />
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-(--neu-radius-sm) text-text-muted/40"
          >
            <ChevronRightIcon size={18} />
          </span>
        )}
      </div>

      {!range.isCurrent && (
        <Link
          href={ROUTES.money}
          className="text-xs font-medium text-accent-purple hover:underline"
        >
          {t.thisMonth}
        </Link>
      )}
    </div>
  );
}
