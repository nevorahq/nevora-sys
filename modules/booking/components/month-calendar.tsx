"use client";

import { cn } from "@/shared/utils/cn";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Returns ISO date string "YYYY-MM-DD" in local time
function toLocalDate(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

// Build a 6-row × 7-col grid for a given year/month (Mon-first)
function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1);
  // getDay(): 0=Sun,1=Mon..6=Sat → convert to Mon-first: Mon=0..Sun=6
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toLocalDate(new Date(year, month, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

interface MonthCalendarProps {
  year: number;
  month: number; // 0-based
  availableDates: Set<string>;
  selectedDate: string | null;
  loading: boolean;
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoPrev: boolean;
}

export function MonthCalendar({
  year,
  month,
  selectedDate,
  loading,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  canGoPrev,
}: MonthCalendarProps) {
  const today = toLocalDate(new Date());
  const rows = buildMonthGrid(year, month);

  return (
    <div className="rounded-(--neu-radius-lg) border border-border-soft bg-surface shadow-neu-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={!canGoPrev}
          className="p-1.5 rounded-(--neu-radius-md) text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>

        <span className="text-sm font-semibold text-text-primary">
          {MONTH_NAMES[month]} {year}
        </span>

        <button
          type="button"
          onClick={onNextMonth}
          className="p-1.5 rounded-(--neu-radius-md) text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors"
          aria-label="Next month"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 border-b border-border-soft">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[11px] font-medium text-text-muted uppercase tracking-wide"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="p-4 grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-9 rounded-(--neu-radius-md) bg-surface-sunken animate-pulse" />
          ))}
        </div>
      ) : (
        /* Day grid */
        <div className="p-2">
          {rows.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0.5">
              {week.map((dateStr, di) => {
                if (!dateStr) {
                  return <div key={di} className="h-9" />;
                }

                const isPast = dateStr < today;
                const isSelected = selectedDate === dateStr;
                const isToday = dateStr === today;
                const isDisabled = isPast;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => onSelectDate(dateStr)}
                    aria-label={dateStr}
                    aria-current={isSelected ? "date" : undefined}
                    className={cn(
                      "h-9 w-full rounded-(--neu-radius-md) text-sm font-medium transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                      isSelected
                        ? "bg-text-primary text-text-inverse shadow-neu-inset"
                        : isToday
                          ? "bg-surface border border-border-strong text-text-primary font-bold hover:bg-surface-sunken"
                          : isPast
                            ? "text-text-muted opacity-30 cursor-not-allowed"
                            : "text-text-primary hover:bg-surface-sunken hover:border hover:border-border-strong",
                    )}
                  >
                    {parseInt(dateStr.slice(8), 10)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
