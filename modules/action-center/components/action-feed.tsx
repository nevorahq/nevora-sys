"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOffIcon } from "lucide-react";
import { Checkbox } from "@/shared/ui/checkbox";
import { Button } from "@/shared/ui/button";
import { RestrictedActionTooltip, useAccessGate } from "@/modules/billing/components/access-state";
import { useNotificationIndicator } from "@/modules/notifications/components/notification-provider";
import { ActionCard } from "./action-card";
import { ActionEmptyState } from "./action-empty-state";
import { ActionFilters, type FilterState } from "./action-filters";
import { ActionDetailDrawer } from "./action-detail-drawer";
import { PHASE_B_SECTION_DESCRIPTIONS, PHASE_B_SECTION_LABELS } from "../constants/action-center.constants";
import { groupPhaseBSections } from "../services/phase-b-sections";
import type { ActionFeed as ActionFeedData, ActionFilters as ActionFiltersInput } from "../types/action-center.types";
import {
  ACTIVE_PHASE_B_SECTIONS,
  type ActionItemPriority,
  type ActionItemStatus,
  type ActionSourceType,
} from "../types/action-item.types";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { getActionFeed } from "../actions/get-feed.action";
import { bulkDismissActionItems } from "../actions/bulk-dismiss-action-items";
import { restoreActionItem } from "../actions/restore-action-item";

interface ActionFeedProps {
  initialFeed: ActionFeedData;
  members: { id: string; name: string }[];
  currentUserId: string;
  firstRunDict: Dictionary["firstRun"];
  /** Shown when a filter hides everything, which is not an activation moment. */
  noMatchesLabel: string;
}

const EMPTY_FILTERS: FilterState = { search: "", view: "attention", priority: "", sourceType: "" };

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

/** True when the user has not narrowed the feed — an empty feed then means "no work". */
function isUnfiltered(f: FilterState): boolean {
  return !f.search.trim() && f.view === "attention" && !f.priority && !f.sourceType;
}

export function ActionFeed({
  initialFeed,
  members,
  currentUserId,
  firstRunDict,
  noMatchesLabel,
}: ActionFeedProps) {
  const router = useRouter();
  const { refreshCounters } = useNotificationIndicator();
  const [feed, setFeed] = useState<ActionFeedData>(initialFeed);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mounted = useRef(false);
  const writeGate = useAccessGate("write");

  // Phase B / B5: regroup the fetched page into the three daily-screen sections.
  // Purely presentational — the query, its filters and its cursor are untouched.
  const phaseB = useMemo(() => groupPhaseBSections(feed.sections), [feed]);

  const selectableIds = useMemo(
    () => ACTIVE_PHASE_B_SECTIONS.flatMap((section) => phaseB[section]).map((item) => item.id),
    [phaseB],
  );

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

  function restore(id: string) {
    if (writeGate.blocked) return;
    setRestoringId(id);
    startTransition(async () => {
      const result = await restoreActionItem({ actionItemId: id });
      setRestoringId(null);
      if (!result.ok) {
        setBulkError(result.error);
        return;
      }
      setFeed(await getActionFeed(toInput(filters)));
      refreshCounters();
      router.refresh();
    });
  }

  const totalActive = selectableIds.length;

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

          {ACTIVE_PHASE_B_SECTIONS.map((section) => {
            const items = phaseB[section];
            if (items.length === 0) return null;
            const description = PHASE_B_SECTION_DESCRIPTIONS[section];
            return (
              <section key={section}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  {PHASE_B_SECTION_LABELS[section]}
                  <span className="text-xs font-normal text-text-muted">({items.length})</span>
                </h2>
                {description && <p className="mb-2 -mt-1 text-xs text-text-muted">{description}</p>}
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

      {/* An empty feed is not an activation moment: the Action Center owns
          attention, not creation. A neutral acknowledgement when nothing needs
          review; the "no matches" line only when a filter hid everything. */}
      {totalActive === 0 &&
        (isUnfiltered(filters) ? (
          <ActionEmptyState dict={firstRunDict} />
        ) : (
          <p className="rounded-(--neu-radius) bg-surface-sunken px-4 py-10 text-center text-sm text-text-muted">
            {noMatchesLabel}
          </p>
        ))}

      {/* History, not work: rendered outside the active block so it still shows on
          an otherwise empty screen — "what just happened" is the proof the loop
          closed. Never selectable; the only control is Restore. */}
      {phaseB.recently_updated.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
            {PHASE_B_SECTION_LABELS.recently_updated}
            <span className="text-xs font-normal text-text-muted">({phaseB.recently_updated.length})</span>
          </h2>
          <div className="space-y-2">
            {phaseB.recently_updated.map((item) => (
              <ActionCard
                key={item.id}
                item={item}
                onOpen={setSelectedId}
                muted
                onRestore={writeGate.blocked ? undefined : restore}
                restoring={restoringId === item.id}
              />
            ))}
          </div>
        </section>
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
