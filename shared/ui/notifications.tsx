"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon, CheckSquareIcon, RepeatIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/shared/utils/cn";
import { ROUTES } from "@/shared/config/routes";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { UpcomingRenewal } from "@/modules/subtracker/types/subtracker.types";

interface NotificationsProps {
  overdueCount: number;
  renewals: UpcomingRenewal[];
  dict: Dictionary;
}

export function Notifications({ overdueCount, renewals, dict }: NotificationsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const n = dict.notifications;
  const totalCount = (overdueCount > 0 ? 1 : 0) + renewals.length;

  /* Close on click outside */
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={n.label}
        aria-expanded={open}
        aria-haspopup="true"
        className="soft-icon-button relative w-9 h-9"
      >
        <BellIcon size={18} strokeWidth={1.75} />
        {totalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white leading-none">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label={n.label}
          className={cn(
            "z-50 soft-card p-0 overflow-hidden",
            // Mobile: фиксированное по центру viewport
            "fixed left-1/2 -translate-x-1/2 top-16 w-[calc(100vw-2rem)]",
            // Desktop: абсолютное, прижато к правому краю кнопки
            "md:absolute md:left-auto md:translate-x-0 md:right-0 md:top-11 md:w-72",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">{n.label}</p>
            {totalCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {totalCount}
              </span>
            )}
          </div>

          {/* Items */}
          <div className="flex flex-col">
            {totalCount === 0 && (
              <p className="px-4 py-5 text-sm text-center text-text-muted">{n.empty}</p>
            )}

            {/* Overdue tasks item */}
            {overdueCount > 0 && (
              <Link
                href={ROUTES.tasks}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken border-b border-border-soft last:border-none"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-danger-soft">
                  <CheckSquareIcon size={15} className="text-danger" strokeWidth={2} />
                </div>
                <p className="text-sm text-text-primary">
                  <span className="font-semibold">{overdueCount}</span>{" "}
                  {overdueCount === 1 ? n.overdueTask : n.overdueTasks}
                </p>
              </Link>
            )}

            {/* Upcoming renewals */}
            {renewals.map((renewal) => (
              <Link
                key={renewal.id}
                href={ROUTES.subscriptions}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken border-b border-border-soft last:border-none"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-accent-yellow-soft">
                  <RepeatIcon size={15} className="text-accent-yellow" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{renewal.name}</p>
                  <p className="text-xs text-text-muted">{getRenewalLabel(renewal.daysUntil, n)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getRenewalLabel(daysUntil: number, n: Dictionary["notifications"]): string {
  if (daysUntil === 0) return n.renewalToday;
  if (daysUntil === 1) return n.renewalTomorrow;
  return n.renewalInDays.replace("{{days}}", String(daysUntil));
}
