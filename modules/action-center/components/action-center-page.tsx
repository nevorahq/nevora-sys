import { requireOrg } from "@/lib/auth/require-org";
import { canDo, isAdmin } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { getActivityLog } from "../queries/get-activity-log";
import { getAttentionView } from "../queries/get-attention-view";
import { parseAttentionFilter } from "../services/attention-filter";
import { syncActionItems } from "../services/action-item-generator";
import { ActionCenterHeader } from "./action-center-header";
import { ActionSummaryStrip } from "./action-summary-strip";
import { AttentionList } from "./attention-list";
import { ActivityLog } from "./activity-log";
import { MarkActionsSeen } from "./mark-actions-seen";

/**
 * Action Center — the read-only attention & routing surface.
 *
 * Ownership after the Inbox / Action-Center split:
 *   - Inbox owns capture and capture-derived review (edit / accept / reject).
 *   - Owning modules (Tasks / Money / Subscriptions / Documents) own business
 *     mutations on existing entities.
 *   - Action Center owns READ-ONLY attention: it shows what is outstanding
 *     (action_items) and routes each row to its owning module. It never mutates
 *     business state, confirms, resolves, dismisses, snoozes, assigns or deletes.
 *   - Activity Log owns event history (domain_events), kept strictly separate.
 *
 * The active filter comes from the URL (?filter=<key>) so the summary cards are
 * shareable, refreshable filters over the FULL action_items set — card counts and
 * the list share one contract (services/attention-filter.ts).
 */
export async function ActionCenterPage({ filter }: { filter?: string }) {
  const ctx = await requireOrg();

  if (!canDo(ctx, "action_center.view")) {
    return (
      <div className="soft-card p-6 text-sm text-text-muted">
        You don&apos;t have access to the Action Center.
      </div>
    );
  }

  const supabase = await createClient();

  // Idempotent generation + stale reconciliation (best-effort, never breaks the
  // screen). This is the repair path — owning services still close their own items
  // synchronously; the sweep here catches anything missed and generates new signals.
  try {
    await syncActionItems(supabase, ctx);
  } catch (err) {
    console.error("[ActionCenterPage] sync failed:", err);
  }

  const activeFilter = parseAttentionFilter(filter);

  // Actor display names for the Activity Log's "by <name>" (unchanged behaviour).
  const { data: memberRows } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", ctx.org.id)
    .eq("status", "active");
  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", memberIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const actors: Record<string, string> = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null)?.trim() || "Member"]),
  );

  const [view, activity] = await Promise.all([
    getAttentionView(activeFilter),
    getActivityLog(supabase, ctx.org.id),
  ]);

  return (
    <div className="space-y-6">
      {/* Marks unseen ACTIVITY as seen — independent of obligation state. */}
      <MarkActionsSeen />
      <ActionCenterHeader />

      {/* Summary cards are accessible filters over the read-only Attention list. */}
      <ActionSummaryStrip counts={view.counts} active={view.filter} />
      <AttentionList items={view.items} />

      {/* A separate read-only projection of domain_events (history) — never mixed
          with, nor counted from, the action_items attention list above. */}
      <ActivityLog entries={activity} actors={actors} canViewSecurity={isAdmin(ctx)} />
    </div>
  );
}
