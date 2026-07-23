export const REVIEW_STATES = [
  "detected",
  "suggested",
  "waiting_confirmation",
  "confirmed",
  "rejected",
] as const;

export type ReviewState = (typeof REVIEW_STATES)[number];

export const FINANCIAL_SUGGESTION_TYPES = [
  "create_expense",
  "review_subscription",
  "pay_subscription",
  "request_invoice",
  "cancel_subscription",
  "update_payment_method",
  "check_price_change",
  "suggest_relation",
] as const;

export type FinancialSuggestionType = (typeof FINANCIAL_SUGGESTION_TYPES)[number];

export const SUBSCRIPTION_TASK_SUGGESTION_TYPES = [
  "review_subscription",
  "pay_subscription",
  "request_invoice",
  "cancel_subscription",
  "update_payment_method",
  "check_price_change",
] as const;

export type SubscriptionTaskSuggestionType = (typeof SUBSCRIPTION_TASK_SUGGESTION_TYPES)[number];

const ALLOWED_REVIEW_TRANSITIONS: Record<ReviewState, ReviewState[]> = {
  detected: ["suggested"],
  suggested: ["waiting_confirmation", "rejected"],
  waiting_confirmation: ["confirmed", "rejected"],
  confirmed: [],
  rejected: [],
};

export function canTransitionReviewState(from: ReviewState, to: ReviewState): boolean {
  return from === to || (ALLOWED_REVIEW_TRANSITIONS[from]?.includes(to) ?? false);
}

export function assertReviewStateTransition(from: ReviewState, to: ReviewState): void {
  if (!canTransitionReviewState(from, to)) {
    throw new InvalidReviewTransitionError(from, to);
  }
}

export class InvalidReviewTransitionError extends Error {
  constructor(
    public readonly from: ReviewState,
    public readonly to: ReviewState,
  ) {
    super(`Invalid review state transition: ${from} -> ${to}`);
    this.name = "InvalidReviewTransitionError";
  }
}
