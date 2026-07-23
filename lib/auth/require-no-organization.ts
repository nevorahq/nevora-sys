import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./require-user";
import { ROUTES } from "@/shared/config/routes";

/**
 * The mirror of `requireOrg`: gate the onboarding surfaces
 * (`ONBOARDING_ROUTES`) so only a user WITHOUT an organization reaches them.
 *
 * `routes.ts` has always stated this rule — "пользователь с org не может зайти
 * на эти пути" — but nothing enforced it, so `/onboarding` stayed reachable for
 * an existing member and quietly created a second organization.
 *
 * That second organization is born unusable, which is why this is a guard and
 * not a nicety: the 14-day trial is granted once per billing owner identity
 * (migration 086), so a repeat organization starts on a read-only
 * billing-required subscription — and in private beta there is no checkout to
 * complete, so the user cannot get out of it. Multi-organization support itself
 * is intact (memberships, the switcher, invites); what is closed here is
 * *creating* another one until it is a real, priced product decision.
 *
 * Returns the authenticated user so callers keep their existing `requireUser()`
 * result without a second round-trip.
 */
export async function requireNoOrganization() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  // Fail OPEN on a read error, deliberately: this guard protects a product
  // decision, not data. A transient failure must not lock a genuinely
  // organization-less user out of onboarding — `requireOrg` would then bounce
  // them straight back here, and they could never get in at all.
  if (error) {
    console.error("requireNoOrganization membership lookup error:", error);
    return user;
  }

  if (data && data.length > 0) {
    redirect(ROUTES.dashboard);
  }

  return user;
}

/**
 * Non-redirecting variant for Server Actions, which must return a result rather
 * than throw a navigation. Defense in depth: the page guard hides the form, but
 * the action is a POST endpoint reachable on its own.
 */
export async function hasActiveOrganization(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (error) {
    console.error("hasActiveOrganization lookup error:", error);
    return false; // same fail-open rationale as above
  }
  return Boolean(data && data.length > 0);
}
