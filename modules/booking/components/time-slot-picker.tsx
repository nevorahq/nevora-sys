"use client";

import { cn } from "@/shared/utils/cn";
import type { TimeSlot } from "../availability/types/availability.types";

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selectedSlot: string | null; // ISO start time
  onSelectSlot: (slot: TimeSlot) => void;
  timezone: string;
  loading?: boolean;
  emptyLabel: string;
}

function formatTime(isoString: string, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoString));
}

export function TimeSlotPicker({
  slots,
  selectedSlot,
  onSelectSlot,
  timezone,
  loading = false,
  emptyLabel,
}: TimeSlotPickerProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 rounded-(--neu-radius-md) bg-surface-sunken animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-text-muted">{emptyLabel}</p>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot) => {
        const isSelected = selectedSlot === slot.start;
        return (
          <button
            key={slot.start}
            type="button"
            onClick={() => onSelectSlot(slot)}
            aria-pressed={isSelected}
            className={cn(
              "flex items-center justify-center rounded-(--neu-radius-md) border",
              "py-3 text-sm font-semibold transition-all",
              "min-h-[44px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              isSelected
                ? "bg-text-primary border-text-primary text-text-inverse shadow-neu-inset"
                : "bg-surface border-border-soft shadow-neu-sm text-text-primary hover:border-border-strong hover:shadow-neu-card active:shadow-neu-inset active:scale-[0.98]",
            )}
          >
            {formatTime(slot.start, timezone)}
          </button>
        );
      })}
    </div>
  );
}
