/**
 * Subscriptions domain constants.
 */

export const BILLING_CYCLES = ["weekly", "monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const SUB_CATEGORIES = [
  "entertainment",
  "productivity",
  "cloud",
  "education",
  "health",
  "other",
] as const;
export type SubCategory = (typeof SUB_CATEGORIES)[number];

export const SUB_NAME_MAX = 100;
export const SUB_NOTE_MAX = 500;
export const SUB_URL_MAX = 500;

/**
 * Оповещения: за сколько дней до списания предупреждать.
 * Используется в query get-upcoming-renewals и в UI-badge.
 */
export const ALERT_DAYS = [5, 3, 1] as const;
export type AlertDay = (typeof ALERT_DAYS)[number];

/**
 * Множители для приведения к месячной/годовой стоимости.
 *
 * weekly × 4.33 ≈ monthly
 * monthly × 1 = monthly
 * yearly / 12 ≈ monthly
 */
export const CYCLE_TO_MONTHLY: Record<BillingCycle, number> = {
  weekly: 4.33,
  monthly: 1,
  yearly: 1 / 12,
};

export const CYCLE_TO_YEARLY: Record<BillingCycle, number> = {
  weekly: 52,
  monthly: 12,
  yearly: 1,
};
