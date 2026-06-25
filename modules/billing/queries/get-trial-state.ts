import { createClient } from "@/lib/supabase/server";

export type TrialState =
  | { kind: "active"; daysRemaining: number; endsAt: string }
  | { kind: "expired"; endsAt: string }
  | { kind: "not_trial" };

/**
 * Resolves and persists trial expiry for the current organization.
 * Database RLS remains the enforcement layer; this query exists for UX.
 */
export async function getTrialState(organizationId: string): Promise<TrialState> {
  const supabase = await createClient();

  await supabase.rpc("refresh_trial_status", { p_organization_id: organizationId });

  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("status, trial_ends_at, plan:plans!plan_id(slug)")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return { kind: "not_trial" };

  const plan = Array.isArray(data.plan) ? data.plan[0] : data.plan;
  if ((plan as { slug?: string } | null)?.slug !== "trial" || !data.trial_ends_at) {
    return { kind: "not_trial" };
  }

  if (data.status === "expired" || new Date(data.trial_ends_at).getTime() <= Date.now()) {
    return { kind: "expired", endsAt: data.trial_ends_at };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(0, Math.ceil((new Date(data.trial_ends_at).getTime() - Date.now()) / msPerDay));
  return { kind: "active", daysRemaining, endsAt: data.trial_ends_at };
}
