import type { BillingCycle } from "../constants/subtracker.constants";

export function calculateNextBillingDate(date: string, cycle: BillingCycle): string {
  const [year, month, day] = date.split("-").map(Number);
  const monthsToAdd = cycle === "weekly" ? 0 : cycle === "monthly" ? 1 : 12;

  if (cycle === "weekly") {
    const result = new Date(Date.UTC(year, month - 1, day + 7));
    return result.toISOString().slice(0, 10);
  }

  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
