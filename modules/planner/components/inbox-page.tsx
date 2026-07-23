import { requireOrg } from "@/lib/auth/require-org";
import { canDo } from "@/lib/context/current-context";
import { createClient } from "@/lib/supabase/server";
import { getDictionary } from "@/shared/i18n/get-dictionary";
import { FirstActionWizard, getWizardState } from "@/modules/onboarding";
import { DocumentExtractionReview } from "@/modules/documents/components/document-extraction-review";
import { getInboxDashboardData } from "../queries/get-inbox-dashboard-data";
import { getInboxDocumentReviews } from "../queries/get-inbox-document-reviews";
import { reconcileInboxDocumentCaptures } from "../services/capture-inbox-document";
import { InboxCaptureComposer } from "./inbox-capture-composer";
import { InboxTabs } from "./inbox-tabs";
import { PlannerEntryList } from "./planner-entry-list";
import { PlannerSuggestionCard } from "./planner-suggestion-card";
import type { InboxTab } from "../types/planner.types";

interface InboxPageProps {
  /** Tab to open on load — the Action Center deep-links `review`. */
  initialTab?: InboxTab;
  /** A planner_suggestion to scroll to and highlight in the Review tab. */
  focusSuggestionId?: string | null;
}

/**
 * Async Server Component — the Inbox composition layer.
 *
 * app/.../inbox/page.tsx stays thin; all orchestration (context, dictionary,
 * data load) lives here. No heavy business logic — reads only. Captures and
 * reviews mutate through the components' Server Actions.
 */
export async function InboxPage({ initialTab = "inbox", focusSuggestionId = null }: InboxPageProps = {}) {
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

  const supabase = await createClient();

  // Repair any capture whose Document stored but whose planner link didn't (a
  // crash between the two writes). Best-effort, owner-scoped, idempotent — the
  // Inbox is the capture surface, so "finish on next visit" belongs here, not on
  // the Action Center render.
  if (canDo(ctx, "planner.entry.create")) {
    try {
      await reconcileInboxDocumentCaptures(supabase, ctx);
    } catch (error) {
      console.error("[InboxPage] capture reconcile failed:", error);
    }
  }

  // Onboarding funnel relocated off the Action Center render (which now owns
  // attention only). Fails soft: a broken funnel row never takes the Inbox down.
  const wizard = await getWizardState(supabase, ctx);

  const [data, documentReviews] = await Promise.all([
    getInboxDashboardData(ctx),
    getInboxDocumentReviews(supabase, ctx),
  ]);
  const canUpdateEntries = canDo(ctx, "planner.entry.update");
  const canDeleteEntries = canDo(ctx, "planner.entry.delete");
  const canConfirmFinancial = canDo(ctx, "data.write");
  const reviewCount = data.counts.pending + documentReviews.length;

  const hasReviews = data.pendingDrafts.length > 0 || documentReviews.length > 0;
  const reviewSlot = hasReviews ? (
    <div className="flex flex-col gap-3">
      {data.pendingDrafts.map(({ suggestion, entry }) => (
        // The anchor id lets a deep-linked Action Center signal scroll to and
        // highlight its exact Review card (see InboxTabs focus handling).
        <div key={suggestion.id} id={`suggestion-${suggestion.id}`} className="soft-card scroll-mt-24 p-4">
          {/* The Review tab is the confirm surface, so it carries the B3 panel. */}
          <PlannerSuggestionCard suggestion={suggestion} entry={entry} showExplanation dict={dict} />
        </div>
      ))}

      {/* Capture-derived financial reviews: a document captured in the Inbox whose
          extraction produced an expense draft is confirmed here, reusing the
          Documents review UI + review Server Actions (money-safe, no duplication). */}
      {documentReviews.map(({ documentId, state }) => (
        <div key={documentId} id={`document-${documentId}`} className="scroll-mt-24">
          <DocumentExtractionReview documentId={documentId} state={state} canConfirm={canConfirmFinancial} t={fullDict.documents} stateLabels={fullDict.money.states} />
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

      <InboxCaptureComposer dict={dict} orgName={ctx.org.name} />

      <FirstActionWizard state={wizard} dict={fullDict.firstRun} />

      <InboxTabs
        dict={dict}
        pendingCount={reviewCount}
        initialTab={initialTab}
        focusSuggestionId={focusSuggestionId}
        inboxSlot={
          <PlannerEntryList
            entries={data.entries}
            dict={dict}
            firstRunDict={fullDict.firstRun}
            canUpdate={canUpdateEntries}
            canDelete={canDeleteEntries}
          />
        }
        reviewSlot={reviewSlot}
      />
    </div>
  );
}
