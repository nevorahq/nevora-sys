"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionCard } from "./action-card";
import { ActionFilters, type FilterState } from "./action-filters";
import { ActionDetailDrawer } from "./action-detail-drawer";
import { ActionEmptyState } from "./action-empty-state";
import { SECTION_LABELS, SECTION_ORDER } from "../constants/action-center.constants";
import type { ActionFeed as ActionFeedData, ActionFilters as ActionFiltersInput } from "../types/action-center.types";
import type { ActionItemPriority, ActionSourceType } from "../types/action-item.types";
import { getActionFeed } from "../actions/get-feed.action";

interface ActionFeedProps {
  initialFeed: ActionFeedData;
  members: { id: string; name: string }[];
  currentUserId: string;
}

const EMPTY_FILTERS: FilterState = { search: "", priority: "", sourceType: "" };

function toInput(f: FilterState, cursor?: string): ActionFiltersInput {
  return {
    search: f.search.trim() || undefined,
    priority: f.priority ? [f.priority as ActionItemPriority] : undefined,
    sourceType: f.sourceType ? [f.sourceType as ActionSourceType] : undefined,
    cursor,
    limit: 50,
  };
}

export function ActionFeed({ initialFeed, members, currentUserId }: ActionFeedProps) {
  const router = useRouter();
  const [feed, setFeed] = useState<ActionFeedData>(initialFeed);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mounted = useRef(false);

  // Re-fetch при изменении фильтров (debounce для search).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const handle = setTimeout(() => {
      startTransition(async () => {
        const next = await getActionFeed(toInput(filters));
        setFeed(next);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [filters]);

  function reload() {
    startTransition(async () => {
      const next = await getActionFeed(toInput(filters));
      setFeed(next);
    });
    router.refresh(); // обновить summary strip (server)
  }

  function loadMore() {
    if (!feed.nextCursor) return;
    startTransition(async () => {
      const page = await getActionFeed(toInput(filters, feed.nextCursor!));
      setFeed((prev) => ({
        sections: {
          due_soon: [...prev.sections.due_soon, ...page.sections.due_soon],
          waiting_for_action: [...prev.sections.waiting_for_action, ...page.sections.waiting_for_action],
          missing_information: [...prev.sections.missing_information, ...page.sections.missing_information],
          ai_suggestions: [...prev.sections.ai_suggestions, ...page.sections.ai_suggestions],
          recently_resolved: prev.sections.recently_resolved,
        },
        nextCursor: page.nextCursor,
      }));
    });
  }

  const totalActive =
    feed.sections.due_soon.length +
    feed.sections.waiting_for_action.length +
    feed.sections.missing_information.length +
    feed.sections.ai_suggestions.length;

  return (
    <div className="space-y-5">
      <ActionFilters value={filters} onChange={setFilters} />

      {totalActive === 0 && feed.sections.recently_resolved.length === 0 ? (
        <ActionEmptyState />
      ) : (
        <div className={`space-y-6 ${pending ? "opacity-70" : ""}`}>
          {SECTION_ORDER.map((section) => {
            const items = feed.sections[section];
            if (items.length === 0) return null;
            const muted = section === "recently_resolved";
            return (
              <section key={section}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  {SECTION_LABELS[section]}
                  <span className="text-xs font-normal text-text-muted">({items.length})</span>
                </h2>
                <div className="space-y-2">
                  {items.map((item) => (
                    <ActionCard key={item.id} item={item} onOpen={setSelectedId} muted={muted} />
                  ))}
                </div>
              </section>
            );
          })}

          {feed.nextCursor && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={loadMore}
                disabled={pending}
                className="rounded-(--neu-radius-pill) bg-surface-sunken px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      <ActionDetailDrawer
        itemId={selectedId}
        members={members}
        currentUserId={currentUserId}
        onClose={() => setSelectedId(null)}
        onMutated={reload}
      />
    </div>
  );
}
