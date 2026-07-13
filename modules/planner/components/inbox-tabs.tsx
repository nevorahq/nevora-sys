"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/utils/cn";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import type { InboxTab } from "../types/planner.types";

interface InboxTabsProps {
  dict: Dictionary["inbox"];
  pendingCount: number;
  inboxSlot: React.ReactNode;
  reviewSlot: React.ReactNode;
  /** Tab to open on load (Action Center deep-links `review`). */
  initialTab?: InboxTab;
  /** A planner_suggestion to scroll to and highlight once the Review tab is shown. */
  focusSuggestionId?: string | null;
}

/**
 * MVP tabs: Inbox (all captures) and Review (pending suggestions). Server-rendered
 * content is passed in as slots; this client component toggles visibility and,
 * when the URL deep-links a suggestion, opens Review and highlights that card.
 */
export function InboxTabs({
  dict,
  pendingCount,
  inboxSlot,
  reviewSlot,
  initialTab = "inbox",
  focusSuggestionId = null,
}: InboxTabsProps) {
  const [tab, setTab] = useState<InboxTab>(initialTab);

  const tabs: { id: InboxTab; label: string; badge?: number }[] = [
    { id: "inbox", label: dict.tabInbox },
    { id: "review", label: dict.tabReview, badge: pendingCount || undefined },
  ];

  // Deep link: once the Review tab is visible, bring the targeted suggestion into
  // view and flash a ring so the user lands on the exact card, not a long list.
  useEffect(() => {
    if (tab !== "review" || !focusSuggestionId) return;
    const el = document.getElementById(`suggestion-${focusSuggestionId}`);
    if (!el) return;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-accent-yellow/70");
    const handle = setTimeout(() => el.classList.remove("ring-2", "ring-accent-yellow/70"), 2400);
    return () => clearTimeout(handle);
  }, [tab, focusSuggestionId]);

  function selectTab(next: InboxTab) {
    setTab(next);
    // Keep the URL honest without a navigation/refresh, so a shared/bookmarked
    // deep link and the visible tab stay in sync.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "inbox") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-(--neu-radius-md) bg-surface-sunken p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
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
