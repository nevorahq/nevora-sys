import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config/routes";

/**
 * Legacy Action Center route.
 *
 * The Action Center moved to `/dashboard` (it is the primary operating screen).
 * This stub stays because the old path is durable in places we do not control:
 * user bookmarks, a stale client-side nav cache, service-worker push payloads,
 * and `target_url` values already written to `notifications` rows in the DB.
 *
 * `redirect()` in a Server Component serves a 307 (temporary) — deliberately not
 * `permanentRedirect()`, whose 308 browsers cache indefinitely.
 */
export default function LegacyActionsRoute() {
  redirect(ROUTES.dashboard);
}
