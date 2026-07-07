"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOffIcon } from "lucide-react";
import { Checkbox } from "@/shared/ui/checkbox";
import { Button } from "@/shared/ui/button";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { useNotificationIndicator } from "@/modules/notifications/components/notification-provider";
import { ActionCard } from "./action-card";
import { ActionFilters, type FilterState } from "./action-filters";
import { ActionDetailDrawer } from "./action-detail-drawer";
import { SECTION_LABELS, SECTION_ORDER } from "../constants/action-center.constants";
import type { ActionFeed as ActionFeedData, ActionFilters as ActionFiltersInput } from "../types/action-center.types";
import type { ActionItemPriority, ActionItemStatus, ActionSourceType } from "../types/action-item.types";
import { getActionFeed } from "../actions/get-feed.action";
import { bulkDismissActionItems } from "../actions/bulk-dismiss-action-items";

interface ActionFeedProps {
  initialFeed: ActionFeedData;
  members: { id: string; name: string }[];
  currentUserId: string;
}

const EMPTY_FILTERS: FilterState = { search: "", view: "attention", priority: "", sourceType: "" };
const VISIBLE_SECTION_ORDER = SECTION_ORDER.filter((section) => section !== "recently_resolved");

function toInput(f: FilterState, cursor?: string): ActionFiltersInput {
  return {
    search: f.search.trim() || undefined,
    status: (f.view === "attention" ? ["open", "in_progress", "failed"] : f.view === "snoozed" ? ["snoozed"] : undefined) as ActionItemStatus[] | undefined,
    priority: f.priority ? [f.priority as ActionItemPriority] : undefined,
    sourceType: f.sourceType ? [f.sourceType as ActionSourceType] : undefined,
    cursor,
    limit: 50,
  };
}

export function ActionFeed({ initialFeed, members, currentUserId }: ActionFeedProps) {
  const router = useRouter();
  const { refreshCounters } = useNotificationIndicator();
  const [feed, setFeed] = useState<ActionFeedData>(initialFeed);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mounted = useRef(false);
  const writeGate = useAccessGate("write");

  const selectableIds = useMemo(() => [
    ...feed.sections.due_soon,
    ...feed.sections.waiting_for_action,
    ...feed.sections.missing_information,
    ...feed.sections.ai_suggestions,
  ].map((item) => item.id), [feed]);

  const selectedVisibleIds = useMemo(() => selectableIds.filter((id) => selectedIds.has(id)), [selectableIds, selectedIds]);
  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedVisibleIds.length;

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
        setSelectedIds(new Set());
        setBulkError(null);
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

  function toggleOne(id: string, checked: boolean) {
    setBulkError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setBulkError(null);
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  }

  function dismissSelected() {
    if (selectedVisibleIds.length === 0 || writeGate.blocked) return;
    const actionItemIds = selectedVisibleIds;
    startTransition(async () => {
      setBulkError(null);
      const result = await bulkDismissActionItems({
        actionItemIds,
        reason: "bulk_inactive",
      });
      if (!result.ok) {
        setBulkError(result.error);
        return;
      }
      setSelectedIds(new Set());
      const next = await getActionFeed(toInput(filters));
      setFeed(next);
      refreshCounters();
      router.refresh();
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

      {totalActive > 0 && (
        <div className={`space-y-6 ${pending ? "opacity-70" : ""}`}>
          {selectableIds.length > 0 && (
            <div className="flex flex-col gap-3 rounded-(--neu-radius) bg-surface-sunken p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  aria-label="Select all active actions"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleAll(event.currentTarget.checked)}
                />
                <p className="text-sm text-text-secondary">
                  {selectedCount > 0 ? `${selectedCount} selected` : "Select actions"}
                </p>
              </div>
              <RestrictedActionTooltip message={writeGate.blocked ? writeGate.message : "Make inactive"}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={dismissSelected}
                  disabled={selectedCount === 0 || writeGate.blocked}
                  isLoading={pending && selectedCount > 0}
                  className="self-start sm:self-auto"
                >
                  <EyeOffIcon size={16} />
                  Make inactive
                </Button>
              </RestrictedActionTooltip>
            </div>
          )}

          {bulkError && <p className="text-sm text-danger" role="alert">{bulkError}</p>}

          {VISIBLE_SECTION_ORDER.map((section) => {
            const items = feed.sections[section];
            if (items.length === 0) return null;
            return (
              <section key={section}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  {SECTION_LABELS[section]}
                  <span className="text-xs font-normal text-text-muted">({items.length})</span>
                </h2>
                <div className="space-y-2">
                  {items.map((item) => (
                    <ActionCard
                      key={item.id}
                      item={item}
                      onOpen={setSelectedId}
                      muted={false}
                      selected={selectedIds.has(item.id)}
                      onSelectedChange={toggleOne}
                    />
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
