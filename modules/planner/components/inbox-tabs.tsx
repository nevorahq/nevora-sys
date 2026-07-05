"use client";

import { useState } from "react";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { InboxTab } from "../types/planner.types";

interface InboxTabsProps {
  dict: Dictionary["inbox"];
  pendingCount: number;
  inboxSlot: React.ReactNode;
  reviewSlot: React.ReactNode;
}

/**
 * MVP tabs: Inbox (all captures) and Review (pending suggestions). Server-rendered
 * content is passed in as slots; this client component only toggles visibility.
 * Today / Goals are deliberately out of the MVP — they are aggregation views, not
 * new engines, and will be added later.
 */
export function InboxTabs({ dict, pendingCount, inboxSlot, reviewSlot }: InboxTabsProps) {
  const [tab, setTab] = useState<InboxTab>("inbox");

  const tabs: { id: InboxTab; label: string; badge?: number }[] = [
    { id: "inbox", label: dict.tabInbox },
    { id: "review", label: dict.tabReview, badge: pendingCount || undefined },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-(--neu-radius-md) bg-surface-sunken p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-(--neu-radius-sm) px-3 py-2 text-sm font-medium transition-all",
              tab === t.id
                ? "bg-surface text-text-primary shadow-neu"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {t.label}
            {t.badge ? (
              <span className="rounded-full bg-accent-yellow px-1.5 text-[10px] font-bold text-text-primary">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={tab === "inbox" ? "block" : "hidden"}>{inboxSlot}</div>
      <div className={tab === "review" ? "block" : "hidden"}>{reviewSlot}</div>
    </div>
  );
}
