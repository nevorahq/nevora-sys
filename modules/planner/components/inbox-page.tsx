import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { getInboxDashboardData } from "../queries/get-inbox-dashboard-data";
import { CaptureInput } from "./capture-input";
import { InboxTabs } from "./inbox-tabs";
import { PlannerEntryList } from "./planner-entry-list";
import { PlannerSuggestionCard } from "./planner-suggestion-card";

/**
 * Async Server Component — the Inbox composition layer.
 *
 * app/.../inbox/page.tsx stays thin; all orchestration (context, dictionary,
 * data load) lives here. No heavy business logic — reads only. Captures and
 * reviews mutate through the components' Server Actions.
 */
export async function InboxPage() {
  const ctx = await requireOrg();
  const { dict: fullDict } = await getDictionary();
  const dict = fullDict.inbox;

  if (!canDo(ctx, "planner.entry.read")) {
    return (
      <div className="soft-card p-6 text-sm text-text-muted">
        You don&apos;t have access to the Inbox.
      </div>
    );
  }

  const data = await getInboxDashboardData(ctx);
  const canUpdateEntries = canDo(ctx, "planner.entry.update");
  const canDeleteEntries = canDo(ctx, "planner.entry.delete");

  const reviewSlot =
    data.pendingSuggestions.length > 0 ? (
      <div className="flex flex-col gap-3">
        {data.pendingSuggestions.map((s) => (
          <div key={s.id} className="soft-card p-4">
            <PlannerSuggestionCard suggestion={s} dict={dict} />
          </div>
        ))}
      </div>
    ) : (
      <div className="soft-card p-8 text-center text-sm text-text-tertiary">
        {dict.reviewEmpty}
      </div>
    );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">{dict.title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{dict.subtitle}</p>
      </header>

      <CaptureInput dict={dict} />

      <InboxTabs
        dict={dict}
        pendingCount={data.counts.pending}
        inboxSlot={
          <PlannerEntryList
            entries={data.entries}
            dict={dict}
            canUpdate={canUpdateEntries}
            canDelete={canDeleteEntries}
          />
        }
        reviewSlot={reviewSlot}
      />
    </div>
  );
}
