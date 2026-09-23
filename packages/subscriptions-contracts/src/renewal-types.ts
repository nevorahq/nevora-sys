export const RENEWAL_CASE_STATUSES = ["pending", "reviewing", "keep", "wont_renew"] as const;
export type RenewalCaseStatus = (typeof RENEWAL_CASE_STATUSES)[number];

export const RENEWAL_DECISION_ACTIONS = ["keep", "review", "wont_renew", "snooze", "reopen"] as const;
export type RenewalDecisionAction = (typeof RENEWAL_DECISION_ACTIONS)[number];

export type RenewalAttentionState =
  | "not_required"
  | "future"
  | "needs_decision"
  | "reviewing"
  | "snoozed"
  | "overdue"
  | "resolved_keep"
  | "resolved_wont_renew";

export type SubscriptionRenewalCase = {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  subscription_id: string;
  renewal_date: string;
  decision_due_date: string;
  status: RenewalCaseStatus;
  snoozed_until: string | null;
  decision_note: string | null;
  review_task_id: string | null;
  cancellation_task_id: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RenewalInboxItem = SubscriptionRenewalCase & {
  subscription: {
    id: string;
    name: string;
    amount: number;
    currency: string;
    billing_cycle: "weekly" | "monthly" | "yearly";
    category: string;
    url: string | null;
    is_active: boolean;
    auto_renews: boolean;
  };
  attention_state: RenewalAttentionState;
  days_until_decision: number;
  days_until_renewal: number;
  has_invoice: boolean;
};
