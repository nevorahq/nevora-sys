import type {
  PlanSlug, SubscriptionStatus, BillingCycle,
  UsageMetric, InvoiceStatus,
} from "../constants/billing.constants";

export interface Plan {
  id: string;
  slug: PlanSlug;
  code?: PlanSlug;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  is_active: boolean;
  sort_order?: number;
  max_members: number;
  max_workspaces: number;
  max_tasks: number;
  max_deals: number;
  max_clients: number;
  max_documents: number;
  max_subscriptions: number;
  max_money_transactions: number;
  max_ai_calls_mo: number;
  max_storage_mb: number;
  included_members: number;
  extra_member_price: number;
  features: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  external_id: string | null;
  billing_provider?: string;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan;
}

export interface FeatureFlag {
  id: string;
  organization_id: string;
  flag_key: string;
  is_enabled: boolean;
  override_value: unknown;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageRecord {
  id: string;
  organization_id: string;
  metric: UsageMetric;
  period_month: string;
  quantity: number;
  recorded_at: string;
}

export interface Invoice {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  billing_reason: string | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  external_id: string | null;
  pdf_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Сводка по использованию с лимитами
export interface UsageSummary {
  metric: UsageMetric;
  used: number;
  limit: number;       // -1 = unlimited
  pct: number;         // 0-100, -1 = unlimited
  isOverLimit: boolean;
}

export interface BillingOverview {
  subscription: SubscriptionWithPlan;
  usage: UsageSummary[];
  invoices: Invoice[];
}
