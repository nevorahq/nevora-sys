"use client";

import { cn } from "@/shared/utils/cn";

interface AvailabilityCalendarProps {
  availableDates: string[]; // ["2026-06-12", ...]
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  loading?: boolean;
}

function getDaysInView(availableDates: string[]): {
  date: string;
  label: string;
  dayLabel: string;
  isToday: boolean;
}[] {
  if (availableDates.length === 0) return [];

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-CA");

  return availableDates.map((dateStr) => {
    const date = new Date(`${dateStr}T00:00:00`);
    return {
      date: dateStr,
      label: date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      dayLabel: date.toLocaleDateString("ru-RU", { weekday: "short" }),
      isToday: dateStr === todayStr,
    };
  });
}

export function AvailabilityCalendar({
  availableDates,
  selectedDate,
  onSelectDate,
  loading = false,
}: AvailabilityCalendarProps) {
  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 h-16 w-14 rounded-(--neu-radius-md) bg-surface-sunken animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (availableDates.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-text-muted">
        No available dates in this period
      </p>
    );
  }

  const days = getDaysInView(availableDates);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
      {days.map(({ date, label, dayLabel, isToday }) => {
        const isSelected = selectedDate === date;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelectDate(date)}
            aria-current={isSelected ? "date" : undefined}
            className={cn(
              "shrink-0 flex flex-col items-center justify-center gap-0.5",
              "rounded-(--neu-radius-md) border px-3 py-3 snap-start",
              "min-w-[52px] min-h-[64px] transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              isSelected
                ? "bg-text-primary border-text-primary text-text-inverse shadow-neu-inset"
                : isToday
                  ? "bg-surface border-border-strong shadow-neu-sm text-text-primary"
                  : "bg-surface border-border-soft shadow-neu-sm text-text-primary hover:border-border-strong hover:shadow-neu-card active:shadow-neu-inset",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-medium uppercase",
                isSelected ? "text-text-inverse/70" : "text-text-muted",
              )}
            >
              {dayLabel}
            </span>
            <span className="text-base font-bold leading-none">
              {label.split(" ")[0]}
            </span>
            <span
              className={cn(
                "text-[10px]",
                isSelected ? "text-text-inverse/70" : "text-text-muted",
              )}
            >
              {label.split(" ")[1]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
