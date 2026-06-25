"use client";

import { ClockIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import type { PublicBookingService } from "../services/types/booking-service.types";

interface ServicePickerProps {
  services: PublicBookingService[];
  selected: string | null;
  onSelect: (slug: string) => void;
  durationLabel: string;
}

export function ServicePicker({
  services,
  selected,
  onSelect,
  durationLabel,
}: ServicePickerProps) {
  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <p className="text-sm text-text-muted">No services available</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {services.map((svc) => {
        const isSelected = selected === svc.slug;
        return (
          <li key={svc.slug}>
            <button
              type="button"
              onClick={() => onSelect(svc.slug)}
              className={cn(
                "w-full flex items-center gap-3 rounded-(--neu-radius-lg) p-4 text-left",
                "border transition-all",
                "min-h-[60px]",
                isSelected
                  ? "bg-surface-sunken border-border-strong shadow-neu-inset"
                  : "bg-surface border-border-soft shadow-neu-card hover:shadow-neu-lg hover:border-border-strong active:shadow-neu-inset active:scale-[0.99]",
              )}
            >
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "font-semibold",
                    isSelected ? "text-text-primary" : "text-text-primary",
                  )}
                >
                  {svc.name}
                </p>
                {svc.description && (
                  <p className="mt-0.5 text-xs text-text-muted line-clamp-2">
                    {svc.description}
                  </p>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-1 text-text-muted">
                <ClockIcon className="h-4 w-4" />
                <span className="text-sm">
                  {durationLabel.replace("{{duration}}", String(svc.durationMinutes))}
                </span>
              </div>

              {!isSelected && (
                <ChevronRightIcon className="shrink-0 h-4 w-4 text-text-muted" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
