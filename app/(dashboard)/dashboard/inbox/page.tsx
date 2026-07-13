import { InboxPage } from "@/modules/planner";
import { INBOX_TABS, type InboxTab } from "@/modules/planner";

/**
 * /dashboard/inbox — Capture Inbox.
 *
 * Thin composition layer: all orchestration lives in modules/planner. The
 * `tab`/`suggestion` params let the Action Center deep-link a planner signal
 * straight to its Review card.
 */
export default async function InboxRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; suggestion?: string }>;
}) {
  const { tab, suggestion } = await searchParams;
  const initialTab: InboxTab = INBOX_TABS.includes(tab as InboxTab) ? (tab as InboxTab) : "inbox";
  return <InboxPage initialTab={initialTab} focusSuggestionId={suggestion ?? null} />;
}
