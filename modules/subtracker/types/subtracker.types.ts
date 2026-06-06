import type { BillingCycle, SubCategory } from "../constants/subtracker.constants";

/**
 * Subscription — как приходит из БД.
 */
export type Subscription = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: BillingCycle;
  next_billing_date: string; // ISO date
  category: SubCategory;
  is_active: boolean;
  url: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Summary для dashboard и subscription page.
 */
export type SubSummary = {
  activeCount: number;
  monthlyCost: number;
  yearlyCost: number;
};

/**
 * Upcoming renewal — подписка с информацией о близости списания.
 * daysUntil: сколько дней до next_billing_date.
 */
export type UpcomingRenewal = Subscription & {
  daysUntil: number;
};
