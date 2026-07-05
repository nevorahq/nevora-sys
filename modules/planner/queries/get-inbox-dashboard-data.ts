import "server-only";
import type { CurrentContext } from "@/lib/context/current-context";
import type {
  InboxDashboardData,
  PlannerEntryWithSuggestions,
  PlannerSuggestion,
} from "../types/planner.types";
import { getPlannerEntries } from "./get-planner-entries";
import { getPlannerSuggestions } from "./get-planner-suggestions";

/**
 * Single read for the Inbox page composition. Joins recent entries with their
 * suggestions in memory (two scoped queries, no N+1) and exposes the pending
 * queue for the Review tab.
 */
export async function getInboxDashboardData(
  ctx: CurrentContext,
): Promise<InboxDashboardData> {
  const [entries, suggestions] = await Promise.all([
    getPlannerEntries(ctx, { limit: 50 }),
    getPlannerSuggestions(ctx, { limit: 200 }),
  ]);

  const byEntry = new Map<string, PlannerSuggestion[]>();
  for (const s of suggestions) {
    const list = byEntry.get(s.planner_entry_id) ?? [];
    list.push(s);
    byEntry.set(s.planner_entry_id, list);
  }

  const entriesWithSuggestions: PlannerEntryWithSuggestions[] = entries.map((entry) => ({
    ...entry,
    suggestions: byEntry.get(entry.id) ?? [],
  }));

  const pendingSuggestions = suggestions.filter(
    (s) => s.status === "pending" || s.status === "edited",
  );

  return {
    entries: entriesWithSuggestions,
    pendingSuggestions,
    counts: {
      captured: entries.filter((e) => e.status !== "archived" && e.status !== "accepted" && e.status !== "rejected").length,
      pending: pendingSuggestions.length,
    },
  };
}
