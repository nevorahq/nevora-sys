export interface SubscriptionWritableState {
  status: "trialing" | "active" | "past_due" | "canceled" | "paused" | "expired" | "free";
  planCode: string;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
}

export function isSubscriptionWritableState(
  state: SubscriptionWritableState | null,
  now = new Date(),
): boolean {
  if (!state) return true;

  if (state.planCode === "trial") {
    return state.status === "trialing" && Boolean(state.trialEnd) && new Date(state.trialEnd as string) > now;
  }

  if (state.status === "active" || state.status === "free") return true;
  if (state.status === "past_due") return false;
  if (state.status === "expired" || state.status === "paused") return false;
  if (state.status === "canceled") {
    return Boolean(state.currentPeriodEnd) && new Date(state.currentPeriodEnd as string) > now;
  }

  return false;
}
