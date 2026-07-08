import { requireOrg } from "@/lib/auth/require-org";
import { canDo, isAdmin } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { FirstActionWizard, getWizardState } from "@/modules/onboarding";
import { getActionCenterFeed } from "../queries/get-action-center-feed";
import { getActionCenterSummary } from "../queries/get-action-center-summary";
import { getActivityLog } from "../queries/get-activity-log";
import { syncActionItems } from "../services/action-item-generator";
import { ActionCenterHeader } from "./action-center-header";
import { ActionSummaryStrip } from "./action-summary-strip";
import { ActionFeed } from "./action-feed";
import { ActivityLog } from "./activity-log";
import { MarkActionsSeen } from "./mark-actions-seen";

/**
 * Async Server Component — композиционный слой Action Center.
 *
 * app/.../page.tsx остаётся тонким: вся оркестрация (sync + queries) здесь,
 * в модуле. Тяжёлой бизнес-логики нет — только вызовы сервисов/queries.
 *
 * MVP: syncActionItems на загрузке (идемпотентно, best-effort). Production —
 * event-handlers + cron (см. Remaining Risks).
 */
export async function ActionCenterPage() {
  const ctx = await requireOrg();

  if (!canDo(ctx, "action_center.view")) {
    return (
      <div className="soft-card p-6 text-sm text-text-muted">
        You don&apos;t have access to the Action Center.
      </div>
    );
  }

  const supabase = await createClient();

  // Idempotent generation (best-effort: не должно ломать экран).
  try {
    await syncActionItems(supabase, ctx);
  } catch (err) {
    console.error("[ActionCenterPage] sync failed:", err);
  }

  // Active members для назначения.
  const { data: memberRows } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", ctx.org.id)
    .eq("status", "active");
  const memberIds = (memberRows ?? []).map((m) => m.user_id as string);
  const { data: profiles } = memberIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", memberIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const members = (profiles ?? []).map((p) => ({
    id: p.id as string,
    name: (p.display_name as string | null)?.trim() || "Member",
  }));

  const [feed, summary, activity, wizard, { dict }] = await Promise.all([
    getActionCenterFeed({ limit: 50 }),
    getActionCenterSummary(),
    getActivityLog(supabase, ctx.org.id),
    // Also the only place the onboarding funnel advances; fails soft.
    getWizardState(supabase, ctx),
    getDictionary(),
  ]);

  const actors: Record<string, string> = Object.fromEntries(members.map((m) => [m.id, m.name]));

  return (
    <div className="space-y-6">
      <MarkActionsSeen />
      <ActionCenterHeader />
      <FirstActionWizard state={wizard} dict={dict.firstRun} />
      <ActionSummaryStrip summary={summary} />
      <ActionFeed
        initialFeed={feed}
        members={members}
        currentUserId={ctx.user.id}
        firstRunDict={dict.firstRun}
        // The wizard right above already offers the first actions.
        showFirstActions={!wizard.visible}
        noMatchesLabel={dict.common.noMatches}
      />
      <ActivityLog entries={activity} actors={actors} canViewSecurity={isAdmin(ctx)} />
    </div>
  );
}
