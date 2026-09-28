import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { getAttentionView } from "../queries/get-attention-view";
import { parseAttentionFilter } from "../services/attention-filter";
import { syncActionItems } from "../services/action-item-generator";
import { ActionCenterHeader } from "./action-center-header";
import { ActionSummaryStrip } from "./action-summary-strip";
import { AttentionList } from "./attention-list";
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
 *
 * The active filter comes from the URL (?filter=<key>) so the summary cards are
 * shareable, refreshable filters over the FULL action_items set — card counts and
 * the list share one contract (services/attention-filter.ts).
 */
export async function ActionCenterPage({ filter }: { filter?: string }) {
  const [ctx, { dict, locale }] = await Promise.all([requireOrg(), getDictionary()]);
  const t = dict.actionCenter;

  if (!canDo(ctx, "action_center.view")) {
    return <div className="soft-card p-6 text-sm text-text-muted">{t.noAccess}</div>;
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
  const view = await getAttentionView(activeFilter);

  return (
    <div className="space-y-6">
      {/* Records the visit (action_center_seen), which the activation funnel reads. */}
      <MarkActionsSeen />
      <ActionCenterHeader title={t.title} refreshLabel={t.refresh} />

      {/* Summary cards are accessible filters over the read-only Attention list. */}
      <ActionSummaryStrip counts={view.counts} active={view.filter} labels={t.filters} />
      <AttentionList items={view.items} t={t} locale={locale} />
    </div>
  );
}
