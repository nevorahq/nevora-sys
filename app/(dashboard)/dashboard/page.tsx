import { ActionCenterPage } from "@/modules/action-center";

/**
 * /dashboard — the Action Center, and the primary operating screen.
 *
 * The dashboard answers one question: "what needs my attention today?".
 * It is therefore the Action Center itself, not a metrics roll-up — those moved
 * to `/dashboard/overview` and are reachable from the sidebar.
 *
 * Тонкий composition layer: вся оркестрация в modules/action-center
 * (org scoping via requireOrg + RLS, permission check, idempotent sync).
 */
export default function DashboardPage() {
  return <ActionCenterPage />;
}
