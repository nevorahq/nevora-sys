// trial / start / pro / business — каноничные планы (как на лендинге).
// free / enterprise — legacy (is_active = false), оставлены для grandfathered подписок.
export const PLAN_SLUGS = ["trial", "start", "free", "pro", "business", "enterprise"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "expired", "active", "past_due", "canceled", "paused"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const USAGE_METRICS = [
  "members", "workspaces", "tasks", "deals", "clients",
  "documents", "subscriptions", "money_transactions",
  "ai_calls", "storage_mb",
] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export const INVOICE_STATUSES = ["draft", "open", "paid", "void", "uncollectible"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PLAN_LABELS: Record<PlanSlug, string> = {
  trial:      "Free Trial",
  start:      "Start",
  free:       "Free",
  pro:        "Pro",
  business:   "Business",
  enterprise: "Enterprise",
};

export const SUBSCRIPTION_STATUS_STYLES: Record<SubscriptionStatus, string> = {
  trialing: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  expired:  "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  active:   "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  past_due: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  canceled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  paused:   "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft:         "bg-gray-100 text-gray-500",
  open:          "bg-yellow-50 text-yellow-700",
  paid:          "bg-green-50 text-green-700",
  void:          "bg-gray-100 text-gray-400",
  uncollectible: "bg-red-50 text-red-600",
};

export const USAGE_METRIC_LABELS: Record<UsageMetric, string> = {
  members:            "Team Members",
  workspaces:         "Workspaces",
  tasks:              "Tasks",
  deals:              "Deals",
  clients:            "Clients",
  documents:          "Documents",
  subscriptions:      "Subscriptions",
  money_transactions: "Money transactions",
  ai_calls:           "AI Calls / month",
  storage_mb:         "Storage (MB)",
};

// -1 в лимитах плана означает "неограничено"
export const UNLIMITED = -1;
