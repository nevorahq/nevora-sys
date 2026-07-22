import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config/routes";

/**
 * `/dashboard/overview` folded into Home (Sprint 3 — GAP-C, Home = Action Center).
 *
 * The standalone metrics roll-up is no longer a primary section; its summaries
 * already live inside each module (Money, Work, Subscriptions). The route is kept
 * as a permanent redirect so old bookmarks and links resolve to Home rather than
 * 404. Re-surfacing the roll-up WITHIN Home is a tracked follow-up.
 */
export default function DashboardOverviewPage() {
  redirect(ROUTES.dashboard);
}
