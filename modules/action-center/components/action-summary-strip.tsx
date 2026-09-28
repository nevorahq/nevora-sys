"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangleIcon, CalendarClockIcon, CalendarDaysIcon, Clock3Icon, ListChecksIcon, RotateCcwIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import {
  DEFAULT_ATTENTION_FILTER,
  type AttentionFilterKey,
} from "../services/attention-filter";
import type { AttentionCounts } from "../queries/get-attention-view";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";

const CARDS: { key: AttentionFilterKey; icon: LucideIcon; tone: string }[] = [
  { key: "needs_attention", icon: ListChecksIcon, tone: "text-info" },
  { key: "due_today", icon: CalendarClockIcon, tone: "text-accent-yellow" },
  { key: "upcoming", icon: CalendarDaysIcon, tone: "text-accent-green" },
  { key: "overdue", icon: AlertTriangleIcon, tone: "text-danger" },
  { key: "snoozed", icon: Clock3Icon, tone: "text-accent-lilac" },
  { key: "recently_resolved", icon: RotateCcwIcon, tone: "text-text-muted" },
];

interface ActionSummaryStripProps {
  counts: AttentionCounts;
  active: AttentionFilterKey;
  labels: Dictionary["actionCenter"]["filters"];
}

/**
 * Summary cards, now accessible filter buttons over the read-only Attention list.
 * Selecting a card writes `?filter=<key>` to the URL (shareable, refreshable,
 * back/forward-able); the server re-reads the param and filters the full
 * action_items set — so the number on the card and the list below always use the
 * same conditions. `aria-pressed` exposes the active filter to assistive tech.
 */
export function ActionSummaryStrip({ counts, active, labels }: ActionSummaryStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function selectFilter(key: AttentionFilterKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === DEFAULT_ATTENTION_FILTER) params.delete("filter");
    else params.set("filter", key);
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return (
    <div className={cn("grid grid-cols-3 gap-2 md:gap-3 xl:grid-cols-6", pending && "opacity-70")}>
      {CARDS.map(({ key, icon: Icon, tone }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            // The label is hidden on mobile, so the name must not depend on it.
            aria-label={`${labels[key]}: ${counts[key]}`}
            onClick={() => selectFilter(key)}
            className={cn(
              "group soft-card-sm flex flex-col items-center gap-1.5 p-3 text-center",
              "md:items-stretch md:gap-2 md:p-4 md:text-left",
              // Analog feel: the card lifts under the pointer, presses in on click,
              // and the selected filter stays pressed in.
              "transition-[transform,box-shadow,background-color] duration-200 ease-out motion-reduce:transition-none",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-info/60",
              isActive
                ? "bg-surface-sunken shadow-neu-inset ring-1 ring-info/40"
                : "active:translate-y-0 active:shadow-neu-inset md:hover:-translate-y-1 md:hover:shadow-neu-card motion-reduce:md:hover:translate-y-0",
            )}
          >
            <div aria-hidden="true" className="flex flex-col items-center gap-1.5 md:flex-row md:gap-3">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-(--neu-radius-md) md:h-9 md:w-9",
                  "transition-transform duration-200 ease-out md:group-hover:scale-110 motion-reduce:transform-none",
                  isActive ? "bg-surface" : "bg-surface-sunken",
                  tone,
                )}
              >
                <Icon size={18} />
              </span>
              <p className="text-lg font-semibold tabular-nums text-text-primary md:text-xl">{counts[key]}</p>
            </div>
            {/* Under the count, full card width: long words ("Просрочено") fit. */}
            <p
              aria-hidden="true"
              className={cn(
                "hidden text-xs leading-tight transition-colors md:line-clamp-2",
                isActive ? "text-text-secondary" : "text-text-muted md:group-hover:text-text-secondary",
              )}
            >
              {labels[key]}
            </p>
          </button>
        );
      })}
    </div>
  );
}
