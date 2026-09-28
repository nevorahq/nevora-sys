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
  { key: "needs_attention", icon: ListChecksIcon, tone: "text-accent-blue" },
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
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6", pending && "opacity-70")}>
      {CARDS.map(({ key, icon: Icon, tone }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={isActive}
            onClick={() => selectFilter(key)}
            className={cn(
              "soft-card-sm flex items-center gap-3 p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50",
              isActive ? "ring-2 ring-accent-blue/60" : "hover:bg-surface",
            )}
          >
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-(--neu-radius-md) bg-surface-sunken", tone)}>
              <Icon size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold tabular-nums text-text-primary">{counts[key]}</p>
              <p className="truncate text-xs text-text-muted">{labels[key]}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
